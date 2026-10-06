const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
function env(name){const v=clean(process.env[name]);if(!v)throw new Error(name+' belum dikonfigurasi di Vercel.');return v}
function headers(){const key=env('SUPABASE_SERVICE_ROLE_KEY');return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'}}
function phone(v){let p=clean(v).replace(/\D/g,'');if(p.startsWith('0'))p='62'+p.slice(1);if(p.startsWith('8'))p='62'+p;return p}
async function session(sid){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const r=await fetch(base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sid)+'&select=*&limit=1',{headers:headers(),cache:'no-store'});
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.[0])throw new Error(d?.message||'Sesi tidak ditemukan.');return d[0]
}
async function update(sid,patch){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const r=await fetch(base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sid),{method:'PATCH',headers:{...headers(),Prefer:'return=minimal'},body:JSON.stringify(patch)});
 if(!r.ok){const d=await r.json().catch(()=>null);throw new Error(d?.message||'Gagal memperbarui status sesi.')}
}
async function signed(path,expires=600){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const key=env('SUPABASE_SERVICE_ROLE_KEY');
 const u=base+'/storage/v1/object/sign/boothpro-softfiles/'+encodeURIComponent(path);
 const r=await fetch(u,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:expires})});
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.signedURL)throw new Error('Gagal membuat signed URL untuk '+path);
 return base+'/storage/v1'+d.signedURL
}
async function attachment(url){
 const r=await fetch(url);if(!r.ok)throw new Error('Gagal mengambil file dari Supabase (HTTP '+r.status+').');
 const b=Buffer.from(await r.arrayBuffer());return b.toString('base64')
}
async function sendBrevo(to,name,files){
 const key=env('BREVO_API_KEY'),from=env('BREVO_FROM_EMAIL');
 const attachments=await Promise.all(files.map(async f=>({name:f.name,content:await attachment(f.url)})));
 const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'BOOTHPRO',email:from},to:[{email:to,name}],subject:'BOOTHPRO · Soft File Anda',htmlContent:'<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>BOOTHPRO</h2><p>Halo '+name+', soft file sesi Anda terlampir langsung di email ini.</p><p>Foto Final, GIF Loop, dan Live Session Video siap disimpan.</p></div>',attachments})});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||'Brevo gagal mengirim email.');return d
}
async function sendFonnte(target,name,files){
 const token=env('FONNTE_TOKEN'),p=phone(target);if(!/^62\d{8,15}$/.test(p))throw new Error('Nomor WhatsApp tidak valid.');
 const sendOne=async f=>{
  const body=new URLSearchParams({target:p,url:f.url,filename:f.name,message:'BOOTHPRO · '+f.label});
  const r=await fetch('https://api.fonnte.com/send',{method:'POST',headers:{Authorization:token},body});
  const d=await r.json().catch(()=>null);if(!r.ok||d?.status===false)throw new Error(d?.reason||d?.message||('Fonnte gagal mengirim '+f.name+'.'));return d
 };
 return Promise.all(files.map(sendOne))
}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 const b=req.body||{},sid=clean(b.sessionId),name=clean(b.customerName)||'Pelanggan',method=clean(b.deliveryMethod).toLowerCase(),target=clean(b.target);
 if(!sid||!['email','whatsapp'].includes(method)||!target)return json(res,400,{ok:false,error:'sessionId, deliveryMethod, target wajib.'});
 try{
  const s=await session(sid);
  const paths=[s.photo_path,s.gif_path,s.video_path];
  if(paths.some(x=>!x))throw new Error('3 soft file belum lengkap di Supabase.');
  const urls=await Promise.all(paths.map(p=>signed(p,600)));
  const files=[
   {name:'BoothPro-Photo.png',label:'Foto Final',url:urls[0]},
   {name:'BoothPro-Animation.gif',label:'GIF Loop',url:urls[1]},
   {name:'BoothPro-Live-Session.mp4',label:'Live Session Video',url:urls[2]}
  ];
  await update(sid,{customer_name:name,delivery_method:method,whatsapp:method==='whatsapp'?phone(target):s.whatsapp,email:method==='email'?target:s.email,delivery_status:'sending'});
  if(method==='email'){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))throw new Error('Email tidak valid.');
   await sendBrevo(target,name,files);
  }else{
   await sendFonnte(target,name,files);
  }
  await update(sid,{delivery_status:'sent',sent_at:new Date().toISOString()});
  return json(res,200,{ok:true,sessionId:sid,method});
 }catch(e){
  try{await update(sid,{delivery_status:'failed'})}catch(_){}
  return json(res,500,{ok:false,error:e?.message||String(e)});
 }
};
