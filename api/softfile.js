/**
 * BoothPro Soft File Bundle page.
 * Public session link: /api/softfile?sessionId=...
 * The bundle page reads the manifest with the service role and generates
 * short-lived signed download URLs, so the storage bucket can remain private.
 */
const clean=v=>String(v||'').trim();
const esc=v=>clean(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').setHeader('Cache-Control','no-store').send(JSON.stringify(body));
function config(){
 const base=clean(process.env.SUPABASE_URL).replace(/\/$/,'');
 const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
 if(!base||!key)throw new Error('Konfigurasi cloud belum tersedia.');
 return {base,key};
}
function auth(key){return {apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'}}
async function manifest(sid){
 const {base,key}=config();
 const url=base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&media_status=neq.deleted&select=session_id,photo_url,gif_url,video_url,expires_at,media_status&limit=1';
 const r=await fetch(url,{headers:auth(key),cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||'Soft file tidak dapat dibaca.');
 const row=Array.isArray(d)?d[0]:null;
 if(!row)throw new Error('Soft file sesi tidak ditemukan.');
 if(row.expires_at&&Date.now()>Date.parse(row.expires_at))throw new Error('Soft file sudah kedaluwarsa.');
 return row;
}
async function signedDownload(base,key,path){
 const r=await fetch(base+'/storage/v1/object/sign/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:auth(key),body:JSON.stringify({expiresIn:3600}),cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||d?.error||'Gagal membuat link download soft file.');
 const raw=d?.signedURL||d?.signedUrl;
 if(!raw)throw new Error('Supabase tidak mengembalikan signed download URL.');
 if(/^https?:\/\//i.test(raw))return raw;if(raw.startsWith('/storage/v1/'))return base+raw;if(raw.startsWith('/object/'))return base+'/storage/v1'+raw;if(raw.startsWith('object/'))return base+'/storage/v1/'+raw;throw new Error('Format signed download URL Supabase tidak valid.');
}
function detectFileType(bytes,expected){
 if(expected==='image/png'){
  return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a?{type:'image/png',ext:'png'}:null;
 }
 if(expected==='image/gif'){
  const head=bytes.subarray(0,6).toString('ascii');
  return bytes.length>=100&&(head==='GIF87a'||head==='GIF89a')&&bytes[bytes.length-1]===0x3b?{type:'image/gif',ext:'gif'}:null;
 }
 if(expected==='video/*'){
  if(bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return {type:'video/webm',ext:'webm'};
  if(bytes.length>=12&&bytes.subarray(4,8).toString('ascii')==='ftyp')return {type:'video/mp4',ext:'mp4'};
  return null;
 }
 return null;
}
async function sendDownload(res,url,filename,expectedType){
 const r=await fetch(url,{cache:'no-store'});
 if(!r.ok)throw new Error('File soft file tidak dapat diambil dari storage (HTTP '+r.status+').');
 const bytes=Buffer.from(await r.arrayBuffer());
 if(bytes.length<16)throw new Error('File soft file kosong atau rusak.');
 const actual=detectFileType(bytes,expectedType);
 if(!actual)throw new Error(expectedType==='video/*'?'Format video tidak dikenali. File tidak dikirim dengan ekstensi yang berpotensi salah.':'Isi file tidak cocok dengan format '+expectedType+'. File ditolak agar tidak terunduh sebagai file rusak.');
 if(expectedType==='video/*')filename=filename.replace(/\\.(mp4|webm)$/i,'.'+actual.ext);
 return res.status(200).setHeader('Content-Type',actual.type).setHeader('X-Content-Type-Options','nosniff').setHeader('Content-Length',String(bytes.length)).setHeader('Content-Disposition','attachment; filename="'+filename+'"').setHeader('Cache-Control','private, no-store').send(bytes);
}
function card(title,desc,url,kind){
 if(!url)return '';
 const icon=kind==='video'?'▶':kind==='gif'?'GIF':'IMG';
 return '<article class="card"><div class="icon">'+icon+'</div><div class="copy"><strong>'+esc(title)+'</strong><span>'+esc(desc)+'</span></div><a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener">Save</a></article>';
}
export default async function handler(req,res){
 try{
  const sid=clean(req.query?.sessionId);
  if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(sid))return json(res,400,{ok:false,error:'Session ID tidak valid.'});
  const m=await manifest(sid);
  if(!m.photo_url||!m.gif_url||!m.video_url)return json(res,409,{ok:false,error:'Bundle belum lengkap.'});
  const {base,key}=config();
  const requested=clean(req.query?.download).toLowerCase();
  if(requested){
   if(!['photo','gif','video'].includes(requested))return json(res,400,{ok:false,error:'Jenis download tidak valid.'});
   if(requested==='photo')return sendDownload(res,await signedDownload(base,key,sid+'/photo.png'),'BoothPro-Final-'+sid+'.png','image/png');
   if(requested==='gif')return sendDownload(res,await signedDownload(base,key,sid+'/animation.gif'),'BoothPro-Boomerang-'+sid+'.gif','image/gif');
   try{return await sendDownload(res,await signedDownload(base,key,sid+'/live-session.mp4'),'BoothPro-Live-Session-'+sid+'.mp4','video/*');}
   catch(e){return await sendDownload(res,await signedDownload(base,key,sid+'/live-session.webm'),'BoothPro-Live-Session-'+sid+'.webm','video/*');}
  }
  const [photo,gif,video]=await Promise.all([
   signedDownload(base,key,sid+'/photo.png'),
   signedDownload(base,key,sid+'/animation.gif'),
   signedDownload(base,key,sid+'/live-session.webm').catch(()=>signedDownload(base,key,sid+'/live-session.mp4'))
  ]);
  res.status(200).setHeader('Content-Type','text/html; charset=utf-8').setHeader('Cache-Control','no-store').send(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BOOTHPRO · Soft File</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#08080b;color:#f5f5f7;font-family:Inter,system-ui,-apple-system,sans-serif;min-height:100vh}
main{width:min(720px,100%);margin:auto;padding:28px 18px 44px}.brand{font-size:13px;font-weight:900;letter-spacing:.16em;color:#a78bfa}
h1{font-size:clamp(28px,7vw,48px);line-height:1.05;margin:12px 0}.sub{color:#a1a1aa;line-height:1.6}
.bundle{display:grid;gap:12px;margin-top:26px}.card{display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #27272a;border-radius:18px;background:#111116}
.icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#1f1b2f;color:#c4b5fd;font-weight:900;font-size:12px;flex:none}
.copy{display:grid;gap:4px;flex:1;min-width:0}.copy strong{font-size:15px}.copy span{font-size:12px;color:#a1a1aa}
.btn{display:inline-flex;align-items:center;justify-content:center;min-width:74px;padding:11px 14px;border-radius:12px;background:#6366f1;color:#fff;text-decoration:none;font-weight:800;font-size:13px}
.note{margin-top:18px;text-align:center;color:#71717a;font-size:11px;line-height:1.6}
@media(max-width:520px){main{padding:22px 14px 36px}.card{padding:13px}.btn{min-width:68px}}
</style></head><body><main>
<div class="brand">BOOTHPRO</div><h1>Soft File Anda Siap.</h1>
<p class="sub">Satu link berisi <b>3 file</b> dari sesi foto Anda: foto final yang sama seperti hasil print, GIF, dan Live Video Session.</p>
<section class="bundle">
${card('Foto Final','Hasil akhir + frame + filter, sama seperti print.', '?', 'photo').replace('href="?"','href="/api/softfile?sessionId='+encodeURIComponent(sid)+'&download=photo"')}
${card('GIF','Animasi dari sesi foto.', '?', 'gif').replace('href="?"','href="/api/softfile?sessionId='+encodeURIComponent(sid)+'&download=gif"')}
${card('Live Video Session','Video sesi / momen terbaik yang direkam.', '?', 'video').replace('href="?"','href="/api/softfile?sessionId='+encodeURIComponent(sid)+'&download=video"')}
</section>
<p class="note">ID Sesi: ${esc(sid)}<br>File diunduh melalui BoothPro agar format dan nama file tetap benar.</p>
</main></body></html>`);
 }catch(e){
  const message=e?.message||String(e);
  const status=/tidak ditemukan/i.test(message)?404:/kedaluwarsa/i.test(message)?410:/belum lengkap/i.test(message)?409:/konfigurasi cloud belum tersedia/i.test(message)?503:500;
  res.setHeader('Cache-Control','no-store');
  return json(res,status,{ok:false,error:message});
 }
};
