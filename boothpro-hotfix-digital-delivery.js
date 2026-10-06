(function(){'use strict';
const clean=v=>String(v??'').trim();
function withTimeout(p,ms,label){return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timeout setelah '+Math.round(ms/1000)+' detik.')),ms))])}
async function postJSON(url,body){const r=await withTimeout(fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),30000,'Server '+url);const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw new Error(d?.error||'Permintaan server gagal.');return d}
async function uploadBundle(sid,items){const m=await postJSON('/api/storage-upload',{sessionId:sid,files:items.map(x=>({name:x.name,contentType:x.type,size:x.blob.size}))});if(!Array.isArray(m.uploads)||m.uploads.length!==items.length)throw new Error('Server upload tidak mengembalikan 3 URL upload.');await Promise.all(m.uploads.map(async u=>{const x=items.find(i=>i.name===u.name);if(!x)throw new Error('Manifest upload tidak cocok untuk '+u.name+'.');const r=await withTimeout(fetch(u.uploadUrl,{method:'PUT',headers:{'Content-Type':x.type},body:x.blob}),60000,'Upload '+x.name);if(!r.ok)throw new Error('Upload '+x.name+' gagal (HTTP '+r.status+').')}));return postJSON('/api/storage-complete',{sessionId:sid,paths:m.uploads.map(u=>u.path)})}
function existing(){try{const sid=window.sessionId||'';return window.customerSoftSyncResult||JSON.parse(localStorage.getItem('boothpro_cloud_'+sid)||'null')||{}}catch(e){return {}}}
async function prepare(sid){const state=typeof window.BoothProDeliveryState==='function'?window.BoothProDeliveryState():{};if(!state.finalCompositeDataUrl&&typeof buildCompositeCanvas==='function')state.finalCompositeDataUrl=await withTimeout(buildCompositeCanvas(),30000,'Membuat foto final terlalu lama.');const items=[];if(!state.finalCompositeDataUrl)throw new Error('Foto final belum tersedia.');const pr=await withTimeout(fetch(state.finalCompositeDataUrl),10000,'Foto final tidak dapat diproses.');if(!pr.ok)throw new Error('Foto final tidak dapat diproses.');items.push({name:'photo.png',type:'image/png',blob:await pr.blob()});let gifBlob=null;if(state.finalGifDataUrl){const gr=await withTimeout(fetch(state.finalGifDataUrl),10000,'GIF tersimpan tidak dapat dibaca.');if(gr.ok)gifBlob=await gr.blob()}if(!gifBlob&&typeof generateGifBlob==='function'&&Array.isArray(state.capturedPhotos)&&state.capturedPhotos.length){gifBlob=await withTimeout(generateGifBlob(),45000,'Pembuatan GIF terlalu lama. Coba ulang sesi atau gunakan perangkat dengan dukungan GIF worker.')}if(gifBlob?.size)items.push({name:'animation.gif',type:'image/gif',blob:gifBlob});if(!state.sessionVideoBlob)throw new Error('Video live session belum selesai direkam.');const vb=state.sessionVideoBlob;if(String(vb.type||'').toLowerCase()!=='video/mp4')throw new Error('Browser menghasilkan video '+(vb.type||'tanpa format')+'. Untuk delivery MP4, gunakan browser/perangkat yang mendukung MediaRecorder MP4.');items.push({name:'live-session.mp4',type:'video/mp4',blob:vb});if(items.length!==3)throw new Error('3 soft file belum lengkap.');return uploadBundle(sid,items)}
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
  if(status)status.textContent='Menunggu soft file otomatis...';
  if(autoPromise)await withTimeout(autoPromise,165000,'Sinkronisasi otomatis');
  if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording')await withTimeout(stopSessionRecorder(),10000,'Penutupan rekaman');
  const stored=(window.__BP_DELIVERY_BUNDLE__&&window.__BP_DELIVERY_BUNDLE__[sid]);
  if(!stored)throw new Error('Soft file belum siap. Tunggu sampai status “✓ Soft file siap” lalu kirim lagi.');
  if(status)status.textContent=channel==='email'?'Mengirim 3 file sebagai attachment email...':'Mengirim 3 media langsung ke WhatsApp...';
  const target=channel==='whatsapp'?phone:email;
  const r=await withTimeout(fetch('/api/send-direct-media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,customerName:name,deliveryMethod:channel,target,photoPath:stored.paths.photo,gifPath:stored.paths.gif,videoPath:stored.paths.video})}),120000,'Pengiriman direct media');
  const out=await r.json().catch(()=>null);if(!r.ok||!out?.ok)throw new Error(out?.error||'Pengiriman direct media gagal.');
  if(status)status.textContent=channel==='email'?'✓ 3 file sudah dikirim sebagai attachment email.':'✓ 3 media sudah dikirim langsung ke WhatsApp.';
 }catch(e){if(status)status.textContent='Pengiriman gagal · '+(e.message||e);alert('BOOTHPRO: '+(e.message||e))}
 finally{if(btn){btn.disabled=false;btn.innerHTML='Kirim Soft File'}}
}
window.boothProAutoSyncSoftFile=async function(){
 const sid=getSessionId();if(!sid)throw new Error('Session ID tidak tersedia.');
 if(typeof stopSessionRecorder==='function'&&window.sessionRecorder&&window.sessionRecorder.state==='recording')await stopSessionRecorder();
 const status=$('cloudUploadStatus')||$('customerShareStatus');
 if(status)status.textContent='Menyinkronkan 3 soft file otomatis...';
 const stored=await withTimeout(prepare(sid),150000,'Sinkronisasi otomatis timeout setelah 150 detik.');
 window.__BP_DELIVERY_BUNDLE__=window.__BP_DELIVERY_BUNDLE__||{};window.__BP_DELIVERY_BUNDLE__[sid]=stored;
 if(status)status.textContent='✓ Soft file siap. WA, Email & QR aktif.';
 try{if(typeof generateQR==='function')generateQR((location.origin+'/download/?id='+encodeURIComponent(sid)))}catch(e){}
 return stored;
};
function install(){ensureName();const manual=$('customerSoftSyncManualBtn')||document.querySelector('[onclick="syncCustomerSoftFile()"]');if(manual){manual.classList.add('hidden');manual.setAttribute('aria-hidden','true');manual.tabIndex=-1}const b=$('customerShareSendBtn');if(b&&!b.__bpDD3){b.__bpDD3=true;b.onclick=null;b.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();const channel=!$('customerSharePhone')?.classList.contains('hidden')?'whatsapp':'email';send(channel)},true)}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100));else setTimeout(install,100);let autoSid='';
let autoPromise=null;
async function autoSyncWhenFinal(){
 const step=document.getElementById('step-final')&&!document.getElementById('step-final').classList.contains('hidden')?7:0;
 const sid=getSessionId();
 if(step!==7||!sid||autoSid===sid||autoPromise)return;
 autoSid=sid;
 autoPromise=window.boothProAutoSyncSoftFile().catch(e=>{autoSid='';const st=$('cloudUploadStatus')||$('customerShareStatus');if(st)st.textContent='Sinkronisasi otomatis gagal · '+(e.message||e)}).finally(()=>{autoPromise=null});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(autoSyncWhenFinal,150));
else setTimeout(autoSyncWhenFinal,150);
setInterval(()=>{install();autoSyncWhenFinal()},500);})();