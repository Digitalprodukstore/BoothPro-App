/* BoothPro C9 targeted hotfixes.
 * Non-destructive: keeps the existing C8 composer, cloud sync and server delivery.
 * 1) A captured photo may be assigned to multiple frame slots.
 * 2) If the direct delivery API is unavailable/misconfigured, WhatsApp/Email falls back
 *    to the already-synced soft-file link instead of surfacing an API-key error.
 */
(function(){
  'use strict';

  function installDuplicatePhotoAssignment(){
    if(typeof window.bpEnsureSlotAssignments!=='function') return false;
    if(window.__BP_C9_DUPLICATE_ASSIGNMENT__) return true;
    window.assignPhotoToSlot=function(slot,photoIndex){
      slot=Number(slot); photoIndex=Number(photoIndex);
      if(!Number.isInteger(slot)||!Number.isInteger(photoIndex)||slot<0||photoIndex<0)return;
      try{
        const a=window.bpEnsureSlotAssignments();
        if(slot>=a.length||photoIndex>=a.length)return;
        a[slot]=photoIndex;
        window.__BP_SLOT_ASSIGNMENTS__=a.slice();
        window.__BP_PHOTO_PICK__=null;
        try{if(window.__BP_C8__?.setActiveSlot)window.__BP_C8__.setActiveSlot(slot)}catch(e){}
        try{if(typeof window.renderCaptureReview==='function')window.renderCaptureReview()}catch(e){}
      }catch(e){console.warn('BoothPro C9 duplicate slot assignment:',e)}
    };
    window.__BP_C9_DUPLICATE_ASSIGNMENT__=true;
    return true;
  }

  function resolveSessionId(){
    let sid='';
    try{sid=String(document.getElementById('sessionIdDisplay')?.textContent||'').trim()}catch(e){}
    if(sid)return sid;
    try{
      const keys=Object.keys(localStorage).filter(k=>k.indexOf('boothpro_cloud_')===0);
      if(keys.length)return keys[keys.length-1].slice('boothpro_cloud_'.length);
    }catch(e){}
    return '';
  }
  function softFileData(){
    const sid=resolveSessionId();
    let data=null;
    try{data=JSON.parse(localStorage.getItem('boothpro_cloud_'+sid)||'null')}catch(e){}
    const shareUrl=String(data?.shareUrl||'').trim();
    const photoUrl=String(data?.photoUrl||'').trim();
    const gifUrl=String(data?.gifUrl||'').trim();
    const videoUrl=String(data?.videoUrl||'').trim();
    const url=shareUrl||photoUrl;
    return {sid,shareUrl,photoUrl,gifUrl,videoUrl,url,message:'Halo! Soft file foto BoothPro Anda sudah siap. Silakan buka link berikut.'};
  }
  function phone(v){let n=String(v||'').replace(/\D/g,'');if(n.startsWith('0'))n='62'+n.slice(1);return n}
  function fallbackReason(text){return /api.?key|access.?token|resend|whatsapp api|not configured|belum dikonfigurasi|401|403|unauthor/i.test(String(text||''))}

  async function deliverFallback(channel){
    const status=document.getElementById('customerShareStatus');
    const d=softFileData();
    if(!d.url)throw new Error('Link soft file belum tersedia. Sinkronkan Soft File terlebih dahulu.');
    if(channel==='whatsapp'){
      const to=phone(document.getElementById('customerSharePhone')?.value||'');
      if(!/^62\d{8,15}$/.test(to))throw new Error('Nomor WhatsApp harus format Indonesia 62xxxxxxxxxx.');
      const text=encodeURIComponent(d.message+'\n\n'+d.url+'\nID Sesi: '+(d.sid||'-'));
      const target='https://wa.me/'+to+'?text='+text;
      const w=window.open('about:blank','_blank');
      if(w){try{w.opener=null;w.location.href=target}catch(e){window.location.href=target}}else window.location.href=target;
      if(status)status.innerText='✓ WhatsApp dibuka sebagai fallback. Pengiriman otomatis server belum aktif.';
      return true;
    }
    const email=String(document.getElementById('customerShareEmail')?.value||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Alamat email tidak valid.');
    const subject=encodeURIComponent('Soft File Foto BoothPro '+(d.sid||''));
    const body=encodeURIComponent(d.message+'\n\n'+d.url+'\nID Sesi: '+(d.sid||'-'));
    window.location.href='mailto:'+encodeURIComponent(email)+'?subject='+subject+'&body='+body;
    if(status)status.innerText='✓ Aplikasi email dibuka sebagai fallback. Pengiriman otomatis server belum aktif.';
    return true;
  }

  function installCustomerDelivery(){
    // Delivery is owned by boothpro-hotfix-digital-delivery.js.
    // The old C9 handler read boothpro_cloud_* (legacy Cloudinary data), while
    // the current Supabase bundle is stored in __BP_DELIVERY_BUNDLE__. That mismatch
    // caused the misleading "Link soft file belum tersedia setelah sinkronisasi".
    return true;
  }
  function install(){return installDuplicatePhotoAssignment()&&installCustomerDelivery()}
  if(!install()){let tries=0;const t=setInterval(function(){if(install()||++tries>80)clearInterval(t)},100)}
})();
