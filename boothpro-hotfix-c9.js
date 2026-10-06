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

  // C9 is limited to frame-slot assignment. Direct Soft File delivery is owned by
  // boothpro-hotfix-digital-delivery.js and /api/send-direct-media.
  function install(){return installDuplicatePhotoAssignment()}
  if(!install()){let tries=0;const t=setInterval(function(){if(install()||++tries>80)clearInterval(t)},100)}
})();
