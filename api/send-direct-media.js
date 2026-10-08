const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
function env(name){const v=clean(process.env[name]);if(!v)throw new Error(name+' belum dikonfigurasi di Vercel.');return v}
function headers(){const key=env('SUPABASE_SERVICE_ROLE_KEY');return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'}}
function phone(v){let p=clean(v).replace(/\D/g,'');if(p.startsWith('0'))p='62'+p.slice(1);if(p.startsWith('8'))p='62'+p;return p}
function baseUrl(){return env('SUPABASE_URL').replace(/\/$/,'')}
function publicUrl(path){return baseUrl()+'/storage/v1/object/public/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/')}
async function objectExists(path){const r=await fetch(baseUrl()+'/storage/v1/object/info/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/'),{headers:headers(),cache:'no-store'});return r.ok}
async function session(sid){
 const r=await fetch(baseUrl()+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,photo_url,gif_url,video_url&limit=1',{headers:headers(),cache:'no-store'});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||'Manifest sesi tidak dapat dibaca.');return Array.isArray(d)?d[0]:null
}
async function ensureManifest(sid){
 const paths={photo:sid+'/photo.png',gif:sid+'/animation.gif',webm:sid+'/live-session.webm',mp4:sid+'/live-session.mp4'};
 const [photoOk,gifOk,webmOk]=await Promise.all([objectExists(paths.photo),objectExists(paths.gif),objectExists(paths.webm)]);
 let videoPath=paths.webm;
 if(!videoOk){if(await objectExists(paths.mp4))videoPath=paths.mp4;else throw new Error('Live Session video belum tersedia di Supabase Storage.');}
 if(!photoOk||!gifOk)throw new Error('Foto Final atau GIF belum tersedia di Supabase Storage.');
 const media={photo_url:publicUrl(paths.photo),gif_url:publicUrl(paths.gif),video_url:publicUrl(videoPath),media_status:'uploaded',download_status:'pending',updated_at:new Date().toISOString()};
 const existing=await session(sid);
 let r;
 if(existing){
  r=await fetch(baseUrl()+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid),{method:'PATCH',headers:{...headers(),Prefer:'return=representation'},body:JSON.stringify(media)});
 }else{
  r=await fetch(baseUrl()+'/rest/v1/boothpro_session_manifest',{method:'POST',headers:{...headers(),Prefer:'return=representation'},body:JSON.stringify({session_id:sid,...media})});
 }
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.hint||'Manifest soft file gagal disiapkan.');
 return {session_id:sid,...media};
}
function bundleUrl(req,sid){const configured=clean(process.env.BOOTHPRO_PUBLIC_ORIGIN)||((req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host));return configured.replace(/\/$/,'')+'/api/softfile?sessionId='+encodeURIComponent(sid)}
async function sendBrevo(to,name,url){const key=env('BREVO_API_KEY'),from=env('BREVO_FROM_EMAIL');const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'BOOTHPRO',email:from},to:[{email:to,name}],subject:'BOOTHPRO · Soft File Anda',htmlContent:'<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>BOOTHPRO</h2><p>Halo '+name+', soft file sesi Anda sudah siap.</p><p>Foto Final, GIF Loop, dan Live Session Video tersedia dalam satu bundle.</p><p><a href="'+url+'">Buka & Simpan Soft File</a></p></div>',textContent:'Halo '+name+', soft file BOOTHPRO Anda siap: '+url})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||'Brevo gagal mengirim email.');return d}
async function sendFonnte(target,name,url){const token=env('FONNTE_TOKEN'),p=phone(target);if(!/^62\d{8,15}$/.test(p))throw new Error('Nomor WhatsApp tidak valid.');const body=new URLSearchParams({target:p,message:'Halo '+name+', soft file BOOTHPRO Anda sudah siap.\n\nFoto Final + GIF + Live Session Video tersedia di satu halaman:\n'+url});const r=await fetch('https://api.fonnte.com/send',{method:'POST',headers:{Authorization:token},body});const d=await r.json().catch(()=>null);if(!r.ok||d?.status===false)throw new Error(d?.reason||d?.message||'Fonnte gagal mengirim WhatsApp.');return d}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 const b=req.body||{},sid=clean(b.sessionId),name=clean(b.customerName)||'Pelanggan',method=clean(b.deliveryMethod).toLowerCase(),target=clean(b.target);
 if(!sid||!['email','whatsapp'].includes(method)||!target)return json(res,400,{ok:false,error:'sessionId, deliveryMethod, target wajib.'});
 try{
  const s=await ensureManifest(sid);
  if(!s.photo_url||!s.gif_url||!s.video_url)throw new Error('3 soft file belum lengkap.');
  const url=bundleUrl(req,sid);
  if(method==='email'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))throw new Error('Email tidak valid.');await sendBrevo(target,name,url)}
  else await sendFonnte(target,name,url);
  return json(res,200,{ok:true,sessionId:sid,method,bundleUrl:url});
 }catch(e){return json(res,500,{ok:false,error:e?.message||String(e)})}
};
