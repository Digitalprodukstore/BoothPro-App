(function(){'use strict';
const clean=v=>String(v??'').trim();
function withTimeout(p,ms,label){return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timeout setelah '+Math.round(ms/1000)+' detik.')),ms))])}
async function postJSON(url,body){const r=await withTimeout(fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),30000,'Server '+url);const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'Permintaan server gagal.');return d}
async function deliveryHealth(){const r=await withTimeout(fetch('/api/delivery-health'),10000,'Pemeriksaan konfigurasi delivery');const d=await r.json().catch(()=>null);if(!r.ok||!d)throw new Error('Pemeriksaan server delivery gagal.');if(!d.storageReady)throw new Error('Server delivery belum siap: SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');return d}
function deliveryStatusText(d){if(!d?.storageReady)return 'Soft file belum siap.';const wa=d.delivery?.whatsappReady?'WA siap':'WA belum dikonfigurasi';const em=d.delivery?.emailReady?'Email siap':'Email belum dikonfigurasi';return '✓ Soft file siap · '+wa+' · '+em}
async function uploadBundle(sid,items){const m=await postJSON('/api/storage-upload',{sessionId:sid,files:items.map(x=>({name:x.name,contentType:x.type,size:x.blob.size}))});if(!Array.isArray(m.uploads)||m.uploads.length!==items.length)throw new Error('Server upload tidak mengembalikan 3 URL upload.');await Promise.all(m.uploads.map(async u=>{const x=items.find(i=>i.name===u.name);if(!x)throw new Error('Manifest upload tidak cocok untuk '+u.name+'.');const r=await withTimeout(fetch(u.uploadUrl,{method:'PUT',headers:{'Content-Type':x.type},body:x.blob}),60000,'Upload '+x.name);if(!r.ok)throw new Error('Upload '+x.name+' gagal (HTTP '+r.status+').')}));return postJSON('/api/storage-complete',{sessionId:sid,paths:m.uploads.map(u=>u.path)})}
function existing(){try{const sid=window.sessionId||'';return window.customerSoftSyncResult||JSON.parse(localStorage.getItem('boothpro_cloud_'+sid)||'null')||{}}catch(e){return {}}}
async function generateLightGifBlob(state){const srcs=Array.isArray(state.capturedPhotos)?state.capturedPhotos.filter(Boolean).slice(0,4):[];if(!srcs.length||typeof GIF==='undefined')throw new Error('GIF ringan tidak dapat dibuat.');return new Promise((resolve,reject)=>{const width=160,height=120;const gif=new GIF({workers:1,quality:45,width,height,workerScript:'/gif.worker.js'});let pending=srcs.length,done=false;const timer=setTimeout(()=>{if(done)return;done=true;try{gif.abort?.()}catch(e){}reject(new Error('GIF ringan timeout setelah 25 detik.'))},25000);const fail=e=>{if(done)return;done=true;clearTimeout(timer);try{gif.abort?.()}catch(_){}reject(e)};gif.on('finished',blob=>{if(done)return;done=true;clearTimeout(timer);resolve(blob)});gif.on('abort',()=>fail(new Error('GIF ringan dihentikan.')));srcs.forEach(src=>{const im=new Image();im.onload=()=>{if(done)return;try{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');const scale=Math.max(width/im.width,height/im.height),dw=im.width*scale,dh=im.height*scale;x.drawImage(im,(width-dw)/2,(height-dh)/2,dw,dh);const add=()=>{if(done)return;gif.addFrame(c,{delay:500,copy:true});if(--pending===0){try{gif.render()}catch(e){fail(e)}}};if(state.selectedFrameSrc){const ov=new Image();ov.onload=()=>{try{x.drawImage(ov,0,0,width,height)}catch(e){}add()};ov.onerror=add;ov.src=state.selectedFrameSrc}else add()}catch(e){fail(e)}};im.onerror=()=>fail(new Error('Gagal membaca foto untuk GIF ringan'));im.src=src})})}
async function prepare(sid){const state=typeof window.BoothProDeliveryState==='function'?window.BoothProDeliveryState():{};if(!state.finalCompositeDataUrl&&typeof buildCompositeCanvas==='function')state.finalCompositeDataUrl=await withTimeout(buildCompositeCanvas(),30000,'Membuat foto final terlalu lama.');const items=[];if(!state.finalCompositeDataUrl)throw new Error('Foto final belum tersedia.');const pr=await withTimeout(fetch(state.finalCompositeDataUrl),10000,'Foto final tidak dapat diproses.');if(!pr.ok)throw new Error('Foto final tidak dapat diproses.');items.push({name:'photo.png',type:'image/png',blob:await pr.blob()});let gifBlob=null;if(state.finalGifDataUrl){const gr=await withTimeout(fetch(state.finalGifDataUrl),10000,'GIF tersimpan tidak dapat dibaca.');if(gr.ok)gifBlob=await gr.blob()}if(!gifBlob&&typeof generateLightGifBlob==='function'&&Array.isArray(state.capturedPhotos)&&state.capturedPhotos.length){try{gifBlob=await generateLightGifBlob(state)}catch(e){console.warn('GIF ringan gagal:',e);}}if(!gifBlob?.size)throw new Error('GIF belum tersedia. Sistem tidak akan menunggu generator GIF berat saat pengiriman.');items.push({name:'animation.gif',type:'image/gif',blob:gifBlob});if(!state.sessionVideoBlob)throw new Error('Video live session belum selesai direkam.');const vb=state.sessionVideoBlob;if(String(vb.type||'').toLowerCase()!=='video/mp4')throw new Error('Browser menghasilkan video '+(vb.type||'tanpa format')+'. Untuk delivery MP4, gunakan browser/perangkat yang mendukung MediaRecorder MP4.');items.push({name:'live-session.mp4',type:'video/mp4',blob:vb});return uploadBundle(sid,items)}
function getSessionState(){try{return typeof window.BoothProDeliveryState==='function'?window.BoothProDeliveryState():{}}catch(e){return {}}}
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
  if(status)status.textContent='Memeriksa soft file siap kirim...';
  if(autoPromise){try{await withTimeout(autoPromise,165000,'Sinkronisasi otomatis')}catch(e){throw e}}
  let stored=(window.__BP_DELIVERY_BUNDLE__&&window.__BP_DELIVERY_BUNDLE__[sid]);
  if(!stored){if(status)status.textContent='Soft file belum siap. Menyiapkan foto + GIF + video...';try{stored=await withTimeout(window.boothProAutoSyncSoftFile(),165000,'Sinkronisasi otomatis')}catch(e){throw e}}
  if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording')await withTimeout(stopSessionRecorder(),10000,'Penutupan rekaman');
  stored=stored||(window.__BP_DELIVERY_BUNDLE__&&window.__BP_DELIVERY_BUNDLE__[sid]);
  if(!stored)throw new Error('Soft file belum siap. Sinkronisasi otomatis belum menghasilkan 3 file.');
  if(status)status.textContent='Mengirim 3 file langsung ke '+(channel==='email'?'email':'WhatsApp')+'...';
  const target=channel==='whatsapp'?phone:email;
  const health=await deliveryHealth();
  if(channel==='whatsapp'&&!health.delivery.whatsappReady)throw new Error('WhatsApp delivery belum dikonfigurasi: FONNTE_TOKEN belum ada di Vercel.');
  if(channel==='email'&&!health.delivery.emailReady)throw new Error('Email delivery belum dikonfigurasi: BREVO_API_KEY/BREVO_FROM_EMAIL belum ada di Vercel.');
  const r=await withTimeout(fetch('/api/send-direct-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,customerName:name,deliveryMethod:channel,target,photoPath:stored.paths.photo,gifPath:stored.paths.gif,videoPath:stored.paths.video})}),120000,'Pengiriman direct media');
  const out=await r.json().catch(()=>null);if(!r.ok||!out?.ok)throw new Error(out?.error||'Pengiriman direct media gagal.');
  if(status)status.textContent=channel==='email'?'✓ 3 soft file berhasil dikirim sebagai attachment ke email.':'✓ 3 soft file berhasil dikirim langsung ke WhatsApp.';
 }catch(e){if(status)status.textContent='Pengiriman gagal · '+(e.message||e);alert('BOOTHPRO: '+(e.message||e))}
 finally{if(btn){btn.disabled=false;btn.innerHTML='Kirim Soft File'}}
}
window.boothProAutoSyncSoftFile=async function(){
 const sid=getSessionId();if(!sid)throw new Error('Session ID tidak tersedia.');
 const health=await deliveryHealth();
 if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording')await stopSessionRecorder();
 const status=$('cloudUploadStatus')||$('customerShareStatus');
 if(status)status.textContent='Menyiapkan 3 soft file untuk pengiriman langsung...';
 const stored=await withTimeout(prepare(sid),150000,'Sinkronisasi otomatis timeout setelah 150 detik.');
 window.__BP_DELIVERY_BUNDLE__=window.__BP_DELIVERY_BUNDLE__||{};window.__BP_DELIVERY_BUNDLE__[sid]=stored;
 if(status)status.textContent=deliveryStatusText(health);
 try{if(typeof generateQR==='function')generateQR((location.origin+'/share.html?session='+encodeURIComponent(sid)))}catch(e){}
 return stored;
};
function install(){ensureName();const manual=$('customerSoftSyncManualBtn')||document.querySelector('[onclick="syncCustomerSoftFile()"]');if(manual){manual.classList.add('hidden');manual.setAttribute('aria-hidden','true');manual.tabIndex=-1}const b=$('customerShareSendBtn');if(b&&!b.__bpDD3){b.__bpDD3=true;b.onclick=null;b.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();const channel=!$('customerSharePhone')?.classList.contains('hidden')?'whatsapp':'email';send(channel)},true)}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100));else setTimeout(install,100);let autoSid='';
let autoPromise=null;
async function autoSyncWhenFinal(){const step=document.getElementById('step-final')&&!document.getElementById('step-final').classList.contains('hidden')?7:0;const sid=getSessionId();if(step!==7||!sid||autoSid===sid||autoPromise)return;autoSid=sid;autoPromise=window.boothProAutoSyncSoftFile().catch(e=>{const msg=e?.message||String(e);const st=$('cloudUploadStatus')||$('customerShareStatus');if(st)st.textContent='Sinkronisasi otomatis gagal · '+msg;throw e}).finally(()=>{autoPromise=null})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(autoSyncWhenFinal,150));else setTimeout(autoSyncWhenFinal,150);
setInterval(()=>{install();autoSyncWhenFinal()},500);})();