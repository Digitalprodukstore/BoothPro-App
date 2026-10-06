const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
function env(name){const v=clean(process.env[name]);if(!v)throw new Error(name+' belum dikonfigurasi di Vercel.');return v}
function headers(){const key=env('SUPABASE_SERVICE_ROLE_KEY');return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'}}
function phone(v){let p=clean(v).replace(/\D/g,'');if(p.startsWith('0'))p='62'+p.slice(1);if(p.startsWith('8'))p='62'+p;return p}
async function session(sid){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const r=await fetch(base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,customer_name,whatsapp,email,photo_path,gif_path,video_path,delivery_status&limit=1',{headers:headers(),cache:'no-store'});
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.[0])throw new Error(d?.message||'Sesi tidak ditemukan.');return d[0]
}
async function update(sid,patch){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const r=await fetch(base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sid),{method:'PATCH',headers:{...headers(),Prefer:'return=minimal'},body:JSON.stringify(patch)});
 if(!r.ok){const d=await r.json().catch(()=>null);throw new Error(d?.message||'Gagal memperbarui status sesi.')}
}
async function claimForDelivery(sid,patch){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const filter='session_id=eq.'+encodeURIComponent(sid)+'&or=(delivery_status.is.null,delivery_status.eq.failed)';
 const r=await fetch(base+'/rest/v1/sessions?'+filter,{method:'PATCH',headers:{...headers(),Prefer:'return=representation'},body:JSON.stringify({...patch,delivery_status:'sending'})});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||'Gagal mengunci sesi untuk pengiriman.');
 if(!Array.isArray(d)||!d.length){
  const current=await session(sid);
  if(current.delivery_status==='sent')throw new Error('Soft file untuk sesi ini sudah pernah dikirim.');
  if(current.delivery_status==='sending')throw new Error('Soft file sesi ini sedang dikirim. Silakan tunggu proses selesai.');
  throw new Error('Sesi tidak dapat dikunci untuk pengiriman.');
 }
 return d[0];
}
function bundleUrl(req,sid){
 const configured=clean(process.env.BOOTHPRO_PUBLIC_ORIGIN)||((req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host));
 return configured.replace(/\/$/,'')+'/share.html?session='+encodeURIComponent(sid);
}
async function signedFileUrl(path){
 const base=env('SUPABASE_URL').replace(/\/$/,'');
 const key=env('SUPABASE_SERVICE_ROLE_KEY');
 const r=await fetch(base+'/storage/v1/object/sign/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:900})});
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.signedURL)throw new Error('Gagal membuat URL media '+path.split('/').pop()+'.');
 return /^https?:\/\//i.test(d.signedURL)?d.signedURL:base+'/storage/v1'+d.signedURL;
}
async function sendBrevo(to,name,files){
 const key=env('BREVO_API_KEY'),from=env('BREVO_FROM_EMAIL');
 const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'BOOTHPRO',email:from},to:[{email:to,name}],subject:'BOOTHPRO · Soft File Anda',htmlContent:'<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>BOOTHPRO</h2><p>Halo '+name+', soft file Anda sudah siap.</p><p>Foto Final, GIF, dan Live Session Video dikirim sebagai lampiran email dari BOOTHPRO.</p></div>',textContent:'Halo '+name+', soft file BOOTHPRO Anda sudah siap. Foto Final, GIF, dan Live Session Video terlampir pada email ini.',attachment:files.map(f=>({url:f.url,name:f.name}))})});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||'Brevo gagal mengirim email.');return d
}
async function sendFonnte(target,name,files){
 const token=env('FONNTE_TOKEN'),p=phone(target);if(!/^62\d{8,15}$/.test(p))throw new Error('Nomor WhatsApp tidak valid.');
 for(const f of files){
  const body=new URLSearchParams({target:p,message:'BOOTHPRO · Soft File Anda\n'+f.label,url:f.url,filename:f.name});
  const r=await fetch('https://api.fonnte.com/send',{method:'POST',headers:{Authorization:token},body});
  const d=await r.json().catch(()=>null);if(!r.ok||d?.status===false)throw new Error(d?.reason||d?.message||('Fonnte gagal mengirim '+f.label+'.'));
 }
 return {status:true};
}
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 const b=req.body||{},sid=clean(b.sessionId),name=clean(b.customerName)||'Pelanggan',method=clean(b.deliveryMethod).toLowerCase(),target=clean(b.target);
 if(!sid||!['email','whatsapp'].includes(method)||!target)return json(res,400,{ok:false,error:'sessionId, deliveryMethod, target wajib.'});
 let claimed=false;
 try{
  const s=await session(sid);
  if(!s.photo_path||!s.gif_path||!s.video_path)throw new Error('3 soft file belum lengkap di Supabase.');
  const files=[
   {path:s.photo_path,name:'BOOTHPRO-Foto-Final.png',label:'Foto Final'},
   {path:s.gif_path,name:'BOOTHPRO-GIF.gif',label:'GIF'},
   {path:s.video_path,name:'BOOTHPRO-Live-Session.'+(s.video_path.toLowerCase().endsWith('.webm')?'webm':'mp4'),label:'Video'}
  ];
  if(method==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))throw new Error('Email tidak valid.');
  const normalizedPhone=method==='whatsapp'?phone(target):s.whatsapp;
  if(method==='whatsapp'&&!/^62\d{8,15}$/.test(normalizedPhone))throw new Error('Nomor WhatsApp tidak valid.');
  await claimForDelivery(sid,{customer_name:name,delivery_method:method,whatsapp:normalizedPhone,email:method==='email'?target:s.email});
  claimed=true;
  const media=await Promise.all(files.map(async f=>({...f,url:await signedFileUrl(f.path)})));
  if(method==='email')await sendBrevo(target,name,media);
  else await sendFonnte(target,name,media);
  await update(sid,{delivery_status:'sent',sent_at:new Date().toISOString()});
  return json(res,200,{ok:true,sessionId:sid,method,deliveredFiles:['photo','gif','video'],directMedia:true});
 }catch(e){
  if(claimed){try{await update(sid,{delivery_status:'failed'})}catch(_) {}}
  return json(res,500,{ok:false,error:e?.message||String(e)});
 }
};
