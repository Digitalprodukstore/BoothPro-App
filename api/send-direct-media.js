const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').setHeader('Cache-Control','no-store').send(JSON.stringify(b));
const htmlEscape=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
function env(name){const v=clean(process.env[name]);if(!v)throw new Error(name+' belum dikonfigurasi di Vercel.');return v}
function headers(){const key=env('SUPABASE_SERVICE_ROLE_KEY');return {apikey:key,Authorization:'Bearer '+key,Accept:'application/json'}}
function phone(v){let p=clean(v).replace(/\D/g,'');if(p.startsWith('0'))p='62'+p.slice(1);if(p.startsWith('8'))p='62'+p;return p}
function baseUrl(){return env('SUPABASE_URL').replace(/\/$/,'')}
function publicUrl(path){return baseUrl()+'/storage/v1/object/public/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/')}
async function objectExists(path){const r=await fetch(baseUrl()+'/storage/v1/object/info/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/'),{headers:headers(),cache:'no-store'});return r.ok}
function bundleUrl(req,sid){const configured=clean(process.env.BOOTHPRO_PUBLIC_ORIGIN);const requestOrigin=((req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host)).replace(/\/$/,'');const origin=clean(process.env.VERCEL_ENV)==='preview'?requestOrigin:(configured||requestOrigin);return origin+'/api/softfile?sessionId='+encodeURIComponent(sid)}
async function resolveMedia(sid){
 const paths={photo:sid+'/photo.png',gif:sid+'/animation.gif',webm:sid+'/live-session.webm',mp4:sid+'/live-session.mp4'};
 const [photoOk,gifOk,webmOk,mp4Ok]=await Promise.all([objectExists(paths.photo),objectExists(paths.gif),objectExists(paths.webm),objectExists(paths.mp4)]);
 if(!photoOk)throw new Error('Foto Final belum tersedia di Supabase Storage.');
 if(!gifOk)throw new Error('GIF belum tersedia di Supabase Storage.');
 if(!webmOk&&!mp4Ok)throw new Error('Live Session video belum tersedia di Supabase Storage.');
 const videoPath=mp4Ok?paths.mp4:paths.webm;
 return {photo_url:publicUrl(paths.photo),gif_url:publicUrl(paths.gif),video_url:publicUrl(videoPath),video_mp4_url:mp4Ok?publicUrl(paths.mp4):'',video_webm_url:webmOk?publicUrl(paths.webm):'',video_is_mp4:mp4Ok};
}
async function fonnteSend(target,message,url,filename){const token=env('FONNTE_TOKEN');const form=new URLSearchParams();form.set('target',target);form.set('message',message);form.set('countryCode','62');if(url){form.set('url',url);if(filename)form.set('filename',filename)}const r=await fetch('https://api.fonnte.com/send',{method:'POST',headers:{Authorization:token,'Content-Type':'application/x-www-form-urlencoded'},body:form});const d=await r.json().catch(()=>null);if(!r.ok||d?.status===false)throw new Error(d?.reason||d?.message||'Fonnte gagal mengirim WhatsApp.');return d}
async function sendWhatsApp(target,name,s,bundle){
 const p=phone(target);if(!/^62\d{8,15}$/.test(p))throw new Error('Nomor WhatsApp tidak valid.');
 const media=[{url:s.photo_url,label:'Foto Final',filename:'BoothPro_Final_Photo.png'},{url:s.gif_url,label:'Boomerang GIF',filename:'BoothPro_Boomerang.gif'},{url:s.video_url,label:'Live Session Video',filename:s.video_is_mp4?'BoothPro_Live_Session.mp4':'BoothPro_Live_Session.webm'}];
 const message='Halo '+name+', soft file BOOTHPRO Anda sudah siap.\n\nFoto Final + GIF + Live Session Video akan dikirimkan sekarang.\nLink cadangan tanpa login:\n'+bundle;
 await fonnteSend(p,message,null,null);
 const attachmentResults=[];for(const item of media){try{await fonnteSend(p,'BOOTHPRO · '+item.label,item.url,item.filename);attachmentResults.push({media:item.label,ok:true})}catch(e){attachmentResults.push({media:item.label,ok:false,error:e instanceof Error?e.message:String(e)})}}
 const failed=attachmentResults.filter(x=>!x.ok);if(failed.length)throw new Error('WhatsApp terkirim sebagian. '+failed.map(x=>x.media+': '+x.error).join(' | '));
 return {provider:'fonnte',bundleLink:true,attachments:attachmentResults};
}
async function sendBrevo(to,name,s,bundle){
 const key=env('BREVO_API_KEY'),fromSetting=env('BREVO_FROM_EMAIL');const from=(fromSetting.match(/<([^<>]+)>/)||[])[1]||fromSetting;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))throw new Error('BREVO_FROM_EMAIL harus berupa alamat email valid, misalnya noreply@domain.com.');
 const safeName=htmlEscape(name),safeBundle=htmlEscape(bundle);const attachment=[{url:s.photo_url},{url:s.gif_url},{url:s.video_url}];
 const html='<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>BOOTHPRO</h2><p>Halo '+safeName+', soft file sesi foto Anda sudah siap.</p><p>Foto Final, GIF bergerak, dan Live Session Video terlampir pada email ini.</p><p>Link cadangan: <a href="'+safeBundle+'">Buka &amp; Simpan Semua Soft File</a></p><p>Link dapat dibuka tanpa login BoothPro.</p></div>';
 const text='Halo '+name+', soft file BOOTHPRO Anda sudah siap. Foto Final, GIF, dan Live Session Video terlampir. Link cadangan: '+bundle;
 const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({sender:{name:'BOOTHPRO',email:from},to:[{email:to,name}],subject:'BOOTHPRO · Soft File Anda',htmlContent:html,textContent:text,attachment})});
 const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.code||'Brevo gagal mengirim email.');return d
}
export default async function handler(req,res){if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});const b=req.body||{},sid=clean(b.sessionId),name=clean(b.customerName)||'Pelanggan',method=clean(b.deliveryMethod).toLowerCase(),target=clean(b.target);if(!sid||!['email','whatsapp'].includes(method)||!target)return json(res,400,{ok:false,error:'sessionId, deliveryMethod, target wajib.'});try{const s=await resolveMedia(sid);const bundle=bundleUrl(req,sid);if(method==='email'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))throw new Error('Email tidak valid.');const result=await sendBrevo(target,name,s,bundle);return json(res,200,{ok:true,sessionId:sid,method,bundleUrl:bundle,messageId:result?.messageId||null,delivery:'attachments'})}const result=await sendWhatsApp(target,name,s,bundle);return json(res,200,{ok:true,sessionId:sid,method,bundleUrl:bundle,delivery:'direct-media-plus-bundle-link',details:result})}catch(e){return json(res,500,{ok:false,error:e?.message||String(e)})}};
