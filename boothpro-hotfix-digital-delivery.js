(function(){'use strict';
function $(id){return document.getElementById(id)}
function ensureName(){const box=$('customerShareForm');if(!box||$('customerShareName'))return;const n=document.createElement('input');n.id='customerShareName';n.className='w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-3 text-sm mb-2';n.placeholder='Nama pelanggan';n.autocomplete='name';box.prepend(n)}
function waitForBundle(timeoutMs){const started=Date.now();return new Promise(resolve=>{const tick=()=>{const sid=window.sessionId||'';let local=null;try{local=JSON.parse(localStorage.getItem('boothpro_cloud_'+sid)||'null')}catch(e){}const d=window.customerSoftSyncResult||local||{};if(d.photoUrl&&d.gifUrl&&d.videoUrl)return resolve(d);if(Date.now()-started>=timeoutMs)return resolve(d);setTimeout(tick,500)};tick()})}
async function send(channel){
 const status=$('customerShareStatus'),btn=$('customerShareSendBtn');
 const name=String($('customerShareName')?.value||'').trim();
 const phone=String($('customerSharePhone')?.value||'').trim();
 const email=String($('customerShareEmail')?.value||'').trim();
 if(!name){if(status)status.textContent='Masukkan nama pelanggan.';return}
 if(channel==='whatsapp'&&!phone){if(status)status.textContent='Masukkan nomor WhatsApp.';return}
 if(channel==='email'&&!email){if(status)status.textContent='Masukkan email.';return}
 if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-2"></i>Menyiapkan...'}
 if(status)status.textContent='Menyiapkan 3 soft file tanpa membuka WhatsApp/email di kiosk...';
 try{
   if(typeof syncCustomerSoftFile==='function'&&!window.customerSoftSyncResult){
     const p=syncCustomerSoftFile();
     await Promise.race([p,new Promise(r=>setTimeout(r,12000))]);
   }
   const d=await waitForBundle(30000),sid=window.sessionId||'';
   if(!sid)throw new Error('Session ID tidak tersedia.');
   if(!d.photoUrl||!d.gifUrl||!d.videoUrl)throw new Error('3 soft file belum lengkap. Tunggu sampai proses GIF dan video selesai lalu coba lagi.');
   if(status)status.textContent='Mengirim notifikasi otomatis...';
   const target=channel==='whatsapp'?phone:email;
   const r=await fetch('/api/send-delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,customerName:name,deliveryMethod:channel,target,photoPath:d.photoUrl,gifPath:d.gifUrl,videoPath:d.videoUrl})});
   const out=await r.json().catch(()=>null);
   if(!r.ok||!out?.ok)throw new Error(out?.error||'Pengiriman gagal.');
   if(status)status.textContent='✓ Berhasil dikirim. Pelanggan cukup membuka link BOOTHPRO.';
 }catch(e){if(status)status.textContent='Pengiriman gagal · '+(e.message||e);alert('BOOTHPRO: '+(e.message||e))}
 finally{if(btn){btn.disabled=false;btn.innerHTML='Kirim Soft File'}}
}
function install(){ensureName();const old=window.openCustomerShare;if(old&&!old.__bpDD2){const wrap=function(kind){old(kind);ensureName();const b=$('customerShareSendBtn');if(b)b.onclick=()=>send(kind)};wrap.__bpDD2=true;window.openCustomerShare=wrap}else if(!old){const b=$('customerShareSendBtn');if(b&&!b.__bpDD2){b.__bpDD2=true;b.onclick=()=>send(!$('customerSharePhone')?.classList.contains('hidden')?'whatsapp':'email')}}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100));else setTimeout(install,100);setInterval(install,1000)})();