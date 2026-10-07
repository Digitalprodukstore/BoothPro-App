(function(){'use strict';
const clean=v=>String(v??'').trim();
function withTimeout(p,ms,label){return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timeout setelah '+Math.round(ms/1000)+' detik.')),ms))])}
async function postJSON(url,body){const r=await withTimeout(fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),30000,'Server '+url);const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'Permintaan server gagal.');return d}
async function deliveryHealth(){const r=await withTimeout(fetch('/api/delivery-health'),10000,'Pemeriksaan konfigurasi delivery');const d=await r.json().catch(()=>null);if(!r.ok||!d)throw new Error('Pemeriksaan server delivery gagal.');if(!d.storageReady)throw new Error('Server delivery belum siap: SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');return d}
function deliveryStatusText(d){if(!d?.storageReady)return 'Soft file belum siap.';const wa=d.delivery?.whatsappReady?'WA siap':'WA belum dikonfigurasi';const em=d.delivery?.emailReady?'Email siap':'Email belum dikonfigurasi';return '✓ Soft file siap · '+wa+' · '+em}
async function uploadBundle(sid,items){const m=await postJSON('/api/storage-upload',{sessionId:sid,files:items.map(x=>({name:x.name,contentType:x.type,size:x.blob.size}))});if(!Array.isArray(m.uploads)||m.uploads.length!==items.length)throw new Error('Server upload tidak mengembalikan 3 URL upload.');await Promise.all(m.uploads.map(async u=>{const x=items.find(i=>i.name===u.name);if(!x)throw new Error('Manifest upload tidak cocok untuk '+u.name+'.');const r=await withTimeout(fetch(u.uploadUrl,{method:'PUT',headers:{'Content-Type':x.type},body:x.blob}),60000,'Upload '+x.name);if(!r.ok)throw new Error('Upload '+x.name+' gagal (HTTP '+r.status+').')}));return postJSON('/api/storage-complete',{sessionId:sid,paths:m.uploads.map(u=>u.path)})}
function existing(){try{const sid=window.sessionId||'';return window.customerSoftSyncResult||JSON.parse(localStorage.getItem('boothpro_cloud_'+sid)||'null')||{}}catch(e){return {}}}
async function waitForSessionVideo(maxMs){
 const started=Date.now();
 while(Date.now()-started<maxMs){
  let s=getSessionState();
  if(s?.sessionVideoBlob?.size)return s.sessionVideoBlob;
  if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording'){
   try{await withTimeout(stopSessionRecorder(),10000,'Penutupan rekaman video')}catch(e){}
  }
  s=getSessionState();
  if(s?.sessionVideoBlob?.size)return s.sessionVideoBlob;
  await new Promise(r=>setTimeout(r,300));
 }
 return null;
}
async function prepare(sid){
 const state=typeof window.BoothProDeliveryState==='function'?window.BoothProDeliveryState():{};
 if(!state.finalCompositeDataUrl&&typeof buildCompositeCanvas==='function')state.finalCompositeDataUrl=await withTimeout(buildCompositeCanvas(),30000,'Membuat foto final terlalu lama.');
 const items=[];
 if(!state.finalCompositeDataUrl)throw new Error('Foto final belum tersedia.');
 const pr=await withTimeout(fetch(state.finalCompositeDataUrl),10000,'Foto final tidak dapat diproses.');
 if(!pr.ok)throw new Error('Foto final tidak dapat diproses.');
 items.push({name:'photo.png',type:'image/png',blob:await pr.blob()});

 let gifBlob=null;
 if(state.finalGifDataUrl){
  try{
   const gr=await withTimeout(fetch(state.finalGifDataUrl),10000,'GIF tersimpan tidak dapat dibaca.');
   if(gr.ok)gifBlob=await gr.blob();
  }catch(e){}
 }
 if(!gifBlob?.size&&typeof generateGifBlob==='function'&&Array.isArray(state.capturedPhotos)&&state.capturedPhotos.length){
  let lastErr=null;
  for(let attempt=1;attempt<=2&&!gifBlob?.size;attempt++){
   try{gifBlob=await withTimeout(generateGifBlob(),60000,'Pembuatan GIF timeout.')}
   catch(e){lastErr=e}
   if(!gifBlob?.size&&attempt<2)await new Promise(r=>setTimeout(r,700));
  }
  if(!gifBlob?.size)throw new Error('GIF belum berhasil dibuat. '+(lastErr?.message||'Coba ulang sesi capture.'));
 }
 if(!gifBlob?.size)throw new Error('GIF belum tersedia.');
 items.push({name:'animation.gif',type:'image/gif',blob:gifBlob});

 let videoBlob=state.sessionVideoBlob||null;
 if(!videoBlob?.size)videoBlob=await waitForSessionVideo(15000);
 if(!videoBlob?.size)throw new Error('Live Session video belum selesai direkam. Pastikan kamera aktif sampai masuk halaman hasil.');
 const videoType=String(videoBlob.type||'video/webm').toLowerCase();
 const videoExt=videoType.includes('mp4')?'mp4':'webm';
 items.push({name:'live-session.'+videoExt,type:videoType,blob:videoBlob});
 if(items.length!==3)throw new Error('3 soft file belum lengkap.');
 return uploadBundle(sid,items);
}
function getSessionState(){try{return typeof window.BoothProDeliveryState==='function'?window.BoothProDeliveryState():{}}catch(e){return {}}}
function deliverClientFallback(channel,name,phone,email,sid,stored){
 const base=String(location.origin||'').replace(/\\/$/,'');
 const url=base+'/share.html?session='+encodeURIComponent(sid);
 const status=$('customerShareStatus');
 if(channel==='whatsapp'){
  let n=clean(phone).replace(/\\D/g,'');if(n.startsWith('0'))n='62'+n.slice(1);if(n.startsWith('8'))n='62'+n;
  if(!/^62\\d{8,15}$/.test(n))throw new Error('Nomor WhatsApp tidak valid.');
  const msg=encodeURIComponent('Halo '+(name||'Pelanggan')+', soft file BOOTHPRO Anda sudah siap.\\n\\nFoto Final + GIF + Live Session tersedia di satu link:\\n'+url);
  const target='https://wa.me/'+n+'?text='+msg;
  const w=window.open(target,'_blank');if(!w)location.href=target;
  if(status)status.textContent='✓ WhatsApp dibuka dengan link soft file. Silakan kirim.';
  return true;
 }
 const em=clean(email);if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em))throw new Error('Alamat email tidak valid.');
 const subject=encodeURIComponent('BOOTHPRO · Soft File '+sid);
 const body=encodeURIComponent('Halo '+(name||'Pelanggan')+', soft file BOOTHPRO Anda sudah siap.\\n\\nFoto Final + GIF + Live Session tersedia di satu link:\\n'+url);
 const target='mailto:'+encodeURIComponent(em)+'?subject='+subject+'&body='+body;
 location.href=target;if(status)status.textContent='✓ Aplikasi email dibuka dengan link soft file. Silakan kirim.';
 return true;
}
function getSessionId(){const s=getSessionState();return clean(s.sessionId||window.sessionId||'')}
function $(id){return document.getElementById(id)}
function ensureName(){const box=$('customerShareForm');if(!box||$('customerShareName'))return;const n=document.createElement('input');n.id='customerShareName';n.className='w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-3 text-sm mb-2';n.placeholder='Nama pelanggan';n.autocomplete='name';box.prepend(n)}
async function send(channel){
 const status=$('customerShareStatus'),btn=$('customerShareSendBtn'),name=clean($('customerShareName')?.value),phone=clean($('customerSharePhone')?.value),email=clean($('customerShareEmail')?.value);
 if(!name){if(status)status.textContent='Masukkan nama pelanggan.';return}
 if(channel==='whatsapp'&&!phone){if(status)status.textContent='Masukkan nomor WhatsApp.';return}
 if(channel==='email'&&!email){if(status)status.textContent='Masukkan email.';return}
 if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-2"></i>Mengirim...'}
 try{
  const sid=getSessionId();if(!sid)throw new Error('Session ID tidak tersedia.');
  if(status)status.textContent='Menunggu soft file otomatis...';
  if(autoPromise){try{await withTimeout(autoPromise,165000,'Sinkronisasi otomatis')}catch(e){throw e}}
  let stored=(window.__BP_DELIVERY_BUNDLE__&&window.__BP_DELIVERY_BUNDLE__[sid]);
  if(!stored){if(status)status.textContent='Soft file belum siap, mencoba sinkronisasi otomatis sekarang...';try{stored=await withTimeout(window.boothProAutoSyncSoftFile(),165000,'Sinkronisasi otomatis')}catch(e){throw e}}
  if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording')await withTimeout(stopSessionRecorder(),10000,'Penutupan rekaman');
  stored=stored||(window.__BP_DELIVERY_BUNDLE__&&window.__BP_DELIVERY_BUNDLE__[sid]);
  if(!stored)throw new Error('Soft file belum siap. Sinkronisasi otomatis belum menghasilkan 3 file.');
  if(status)status.textContent=channel==='email'?'Mengirim link soft file...':'Mengirim link soft file...';
  const target=channel==='whatsapp'?phone:email;
  const health=await deliveryHealth();
  if(channel==='whatsapp'&&!health.delivery.whatsappReady)throw new Error('WhatsApp delivery belum dikonfigurasi: FONNTE_TOKEN belum ada di Vercel.');
  if(channel==='email'&&!health.delivery.emailReady)throw new Error('Email delivery belum dikonfigurasi: BREVO_API_KEY/BREVO_FROM_EMAIL belum ada di Vercel.');
  const r=await withTimeout(fetch('/api/send-direct-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,customerName:name,deliveryMethod:channel,target})}),120000,'Pengiriman link soft file');
  const out=await r.json().catch(()=>null);
  if(!r.ok||!out?.ok){
   const msg=out?.error||('HTTP '+r.status);
   // Provider/server delivery can fail for reasons other than missing keys (for example
   // provider rejection, quota, or a transient API error). Do not strand the customer:
   // fall back to the already-synced single soft-file bundle link.
   try{await deliverClientFallback(channel,name,phone,email,sid,stored)}catch(fb){throw new Error(msg+' · Fallback juga gagal: '+(fb?.message||fb));}
   return;
  }
  if(status)status.textContent=channel==='email'?'✓ Soft file dikirim via email.':'✓ Soft file dikirim via WhatsApp.';
 }catch(e){if(status)status.textContent='Pengiriman gagal · '+(e.message||e);alert('BOOTHPRO: '+(e.message||e))}
 finally{if(btn){btn.disabled=false;btn.innerHTML='Kirim Soft File'}}
}
window.boothProAutoSyncSoftFile=async function(){
 const sid=getSessionId();if(!sid)throw new Error('Session ID tidak tersedia.');
 const health=await deliveryHealth();
 const status=$('cloudUploadStatus')||$('customerShareStatus')||$('customerSoftAutoStatus');
 if(status)status.textContent='Menyinkronkan Photo + GIF + Live Session otomatis...';
 try{
  if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording'){
   await withTimeout(stopSessionRecorder(),10000,'Penutupan rekaman');
  }
 }catch(e){console.warn('BoothPro recorder close:',e)}
 const stored=await withTimeout(prepare(sid),180000,'Sinkronisasi otomatis timeout setelah 180 detik.');
 window.__BP_DELIVERY_BUNDLE__=window.__BP_DELIVERY_BUNDLE__||{};
 stored.bundleUrl=String(stored.bundleUrl||((location.origin||'').replace(/\\\/$/,'')+'/download/?id='+encodeURIComponent(sid)));
 window.__BP_DELIVERY_BUNDLE__[sid]=stored;
 if(status)status.textContent='✓ Soft file otomatis tersinkron · Foto + GIF + Live Session';
 try{if(typeof generateQR==='function')generateQR((location.origin+'/download/?id='+encodeURIComponent(sid)))}catch(e){}
 return stored;
};
function install(){ensureName();const manual=$('customerSoftSyncManualBtn')||document.querySelector('[onclick="syncCustomerSoftFile()"]');if(manual){manual.classList.add('hidden');manual.setAttribute('aria-hidden','true');manual.tabIndex=-1}const b=$('customerShareSendBtn');if(b&&!b.__bpDD3){b.__bpDD3=true;b.onclick=null;b.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();const channel=!$('customerSharePhone')?.classList.contains('hidden')?'whatsapp':'email';send(channel)},true)}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100));else setTimeout(install,100);let autoSid='';
let autoPromise=null;
async function autoSyncWhenFinal(){
 const step=document.getElementById('step-final')&&!document.getElementById('step-final').classList.contains('hidden')?7:0;
 const sid=getSessionId();
 if(step!==7||!sid||autoPromise)return;
 if(autoSid===sid&&window.__BP_DELIVERY_BUNDLE__?.[sid])return;
 autoSid=sid;
 autoPromise=window.boothProAutoSyncSoftFile().catch(e=>{
  const msg=e?.message||String(e);
  const st=$('cloudUploadStatus')||$('customerShareStatus')||$('customerSoftAutoStatus');
  if(st)st.textContent='Sinkronisasi otomatis gagal · '+msg+' · Sistem akan mencoba lagi.';
  autoSid='';
  throw e;
 }).finally(()=>{autoPromise=null});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(autoSyncWhenFinal,150));else setTimeout(autoSyncWhenFinal,150);
setInterval(()=>{install();autoSyncWhenFinal()},500);})();