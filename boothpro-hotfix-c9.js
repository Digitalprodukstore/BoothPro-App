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
        a[slot]=photoIndex; window.__BP_SLOT_ASSIGNMENTS__=a.slice(); window.__BP_PHOTO_PICK__=null;
        try{if(window.__BP_C8__?.setActiveSlot)window.__BP_C8__.setActiveSlot(slot)}catch(e){}
        try{if(typeof window.renderCaptureReview==='function')window.renderCaptureReview()}catch(e){}
      }catch(e){console.warn('BoothPro C9 duplicate slot assignment:',e)}
    };
    window.__BP_C9_DUPLICATE_ASSIGNMENT__=true; return true;
  }
  function resolveSessionId(){
    let sid='';
    try{sid=String(document.getElementById('sessionIdDisplay')?.textContent||'').trim()}catch(e){}
    if(sid)return sid;
    try{const keys=Object.keys(localStorage).filter(k=>k.indexOf('boothpro_cloud_')===0);if(keys.length)return keys[keys.length-1].slice('boothpro_cloud_'.length)}catch(e){}
    return '';
  }
  function softFileData(){
    const sid=resolveSessionId(); let data=null;
    try{data=JSON.parse(localStorage.getItem('boothpro_cloud_'+sid)||'null')}catch(e){}
    const shareUrl=String(data?.shareUrl||'').trim(),photoUrl=String(data?.photoUrl||'').trim(),gifUrl=String(data?.gifUrl||'').trim(),videoUrl=String(data?.videoUrl||'').trim();
    return {sid,shareUrl,photoUrl,gifUrl,videoUrl,url:shareUrl||photoUrl,message:'Halo! Soft file foto BoothPro Anda sudah siap. Silakan buka link berikut.'};
  }
  function phone(v){let n=String(v||'').replace(/\D/g,'');if(n.startsWith('0'))n='62'+n.slice(1);return n}
  function fallbackReason(text){return /api.?key|access.?token|resend|whatsapp api|not configured|belum dikonfigurasi|401|403|unauthor/i.test(String(text||''))}
  async function deliverFallback(channel){
    const status=document.getElementById('customerShareStatus'),d=softFileData();
    if(!d.url)throw new Error('Link soft file belum tersedia. Sinkronkan Soft File terlebih dahulu.');
    if(channel==='whatsapp'){
      const to=phone(document.getElementById('customerSharePhone')?.value||'');
      if(!/^62\d{8,15}$/.test(to))throw new Error('Nomor WhatsApp harus format Indonesia 62xxxxxxxxxx.');
      const text=encodeURIComponent(d.message+'\n\n'+d.url+'\nID Sesi: '+(d.sid||'-')),target='https://wa.me/'+to+'?text='+text,w=window.open('about:blank','_blank');
      if(w){try{w.opener=null;w.location.href=target}catch(e){window.location.href=target}}else window.location.href=target;
      if(status)status.innerText='✓ WhatsApp dibuka sebagai fallback. Pengiriman otomatis server belum aktif.'; return true;
    }
    const email=String(document.getElementById('customerShareEmail')?.value||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Alamat email tidak valid.');
    const subject=encodeURIComponent('Soft File Foto BoothPro '+(d.sid||'')),body=encodeURIComponent(d.message+'\n\n'+d.url+'\nID Sesi: '+(d.sid||'-'));
    window.location.href='mailto:'+encodeURIComponent(email)+'?subject='+subject+'&body='+body;
    if(status)status.innerText='✓ Aplikasi email dibuka sebagai fallback. Pengiriman otomatis server belum aktif.'; return true;
  }
  function installCustomerDelivery(){return true;}

  function installKioskTestLayout(){
    if(window.__BP_C9_KIOSK_LAYOUT__)return true;
    if(!document.head)return false;
    const id='bp-c9-kiosk-test-layout';
    if(document.getElementById(id)){window.__BP_C9_KIOSK_LAYOUT__=true;return true;}
    const style=document.createElement('style'); style.id=id;
    style.textContent=[
      'html.bp-kiosk-mode main section.hidden{display:none!important}',
      'html.bp-kiosk-mode main #step-welcome.hidden{display:none!important}',
      'html.bp-kiosk-mode main #step-welcome:not(.hidden){display:flex!important}',
      'html.bp-kiosk-mode #step-capture{padding-bottom:32px;min-width:0;overflow:visible}',
      'html.bp-kiosk-mode #step-capture>div:first-child{margin-bottom:20px;min-width:0}',
      'html.bp-kiosk-mode #step-capture>div:first-child h2{line-height:1.15}',
      'html.bp-kiosk-mode #step-capture>div:first-child p{max-width:760px;line-height:1.55}',
      'html.bp-kiosk-mode #step-capture>div.grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(320px,.85fr);gap:24px;align-items:start;width:100%;min-width:0}',
      'html.bp-kiosk-mode #step-capture>div.grid>div{min-width:0;width:100%}',
      'html.bp-kiosk-mode #step-capture>div.grid>div:first-child{gap:16px;min-width:0}',
      'html.bp-kiosk-mode #step-capture>div.grid>div:first-child>.relative{width:100%;min-width:0}',
      'html.bp-kiosk-mode #step-capture video{display:block;min-height:0;max-width:100%}',
      'html.bp-kiosk-mode #step-capture #filmStripGallery{max-height:240px;min-height:80px;gap:10px;padding-right:4px;overflow-y:auto;overflow-x:hidden}',
      'html.bp-kiosk-mode #step-capture #captureReviewPreview{min-height:200px;max-width:100%;padding:4px;overflow:hidden}',
      'html.bp-kiosk-mode #step-capture .capture-review-shell .editor-frame{width:min(100%,250px);max-width:100%}',
      'html.bp-kiosk-mode #step-capture #nextToFrameBtn{margin-top:18px;min-height:54px}',
      'html.bp-kiosk-mode #step-capture #photoOrderControls{margin-bottom:14px;min-width:0}',
      'html.bp-kiosk-mode #step-capture>div.grid>div:last-child{padding:20px!important;min-width:0;overflow:hidden}',
      'html.bp-kiosk-mode #step-frame>div.grid{align-items:start;grid-template-columns:minmax(0,1.5fr) minmax(320px,.8fr)}',
      'html.bp-kiosk-mode #step-frame .preview-shell{min-height:0;max-width:100%}',
      'html.bp-kiosk-mode #step-frame .safe-scroll{max-height:none;min-width:0;overflow:visible}',
      'html.bp-kiosk-mode #step-final>div.grid{align-items:start;grid-template-columns:minmax(0,1.35fr) minmax(320px,.75fr)}',
      'html.bp-kiosk-mode #step-final .preview-shell{min-height:0;max-width:100%}',
      'html.bp-kiosk-mode #step-final .space-y-5{gap:14px}',
      'html.bp-kiosk-mode #step-package{width:100%;max-width:1220px;min-width:0;overflow-x:hidden}',
      '@media(max-width:1100px){html.bp-kiosk-mode #step-capture>div.grid,html.bp-kiosk-mode #step-frame>div.grid,html.bp-kiosk-mode #step-final>div.grid{grid-template-columns:minmax(0,1fr)}html.bp-kiosk-mode #step-capture>div.grid>div:last-child{padding:18px!important}html.bp-kiosk-mode #step-frame>div.grid>div:first-child,html.bp-kiosk-mode #step-final>div.grid>div:first-child{min-height:0!important}html.bp-kiosk-mode #step-capture #filmStripGallery{max-height:260px}html.bp-kiosk-mode #step-package>div.grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:18px!important;width:100%!important;min-width:0!important}html.bp-kiosk-mode #step-package>div.grid>div{width:100%!important;min-width:0!important;max-width:100%!important}html.bp-kiosk-mode #step-package #packageGrid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:12px!important;width:100%!important;min-width:0!important}html.bp-kiosk-mode #step-package #packageGrid>button{width:100%!important;min-width:0!important;min-height:132px!important}html.bp-kiosk-mode #step-package>div.grid>div:last-child{padding:18px!important;border-radius:22px!important;overflow:hidden!important}}',
      '@media(max-width:640px){html.bp-kiosk-mode main{padding:16px 10px 32px!important}html.bp-kiosk-mode #step-capture>div:first-child{margin-bottom:14px}html.bp-kiosk-mode #step-capture>div:first-child h2{font-size:1.45rem!important}html.bp-kiosk-mode #step-capture>div:first-child p{font-size:11px!important}html.bp-kiosk-mode #step-capture>div.grid{gap:14px}html.bp-kiosk-mode #step-capture>div.grid>div:last-child{padding:14px!important;border-radius:22px!important}html.bp-kiosk-mode #step-capture .capture-review-shell .editor-frame{width:min(100%,230px)}html.bp-kiosk-mode #step-capture #filmStripGallery{max-height:210px;grid-template-columns:repeat(2,minmax(0,1fr))}html.bp-kiosk-mode #step-capture #captureReviewPreview{min-height:180px}html.bp-kiosk-mode #step-package{padding-bottom:32px!important}html.bp-kiosk-mode #step-package>div:first-child{margin-bottom:16px!important}html.bp-kiosk-mode #step-package h2{font-size:clamp(1.55rem,7vw,2.1rem)!important;line-height:1.12!important}html.bp-kiosk-mode #step-package>div.grid{gap:14px!important}html.bp-kiosk-mode #step-package #packageGrid{gap:10px!important}html.bp-kiosk-mode #step-package #packageGrid>button{min-height:124px!important;padding:16px!important;border-radius:20px!important}html.bp-kiosk-mode #step-package>div.grid>div:last-child{padding:14px!important;border-radius:20px!important}}'
    ].join('\n');
    document.head.appendChild(style); window.__BP_C9_KIOSK_LAYOUT__=true; return true;
  }

  function install(){
    return installDuplicatePhotoAssignment()&&installCustomerDelivery()&&installKioskTestLayout();
  }
  if(!install()){let tries=0;const t=setInterval(function(){if(install()||++tries>80)clearInterval(t)},100)}
})();