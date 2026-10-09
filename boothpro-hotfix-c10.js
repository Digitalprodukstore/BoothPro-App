/* BoothPro C10 targeted recorder-start watchdog.
 * Starts Live Session recording as soon as the real camera stream exists.
 * Non-destructive: does not replace camera/capture/editor/delivery logic.
 */
(function(){
  'use strict';
  if(window.__BP_C10_RECORDER_WATCHDOG__) return;
  window.__BP_C10_RECORDER_WATCHDOG__=true;
  window.__BP_C10_RECORDER_START_ATTEMPTS__=0;
  window.__BP_C10_RECORDER_START_TIME__=null;
  function visibleCapture(){
    try{
      const el=document.getElementById('step-capture');
      if(!el) return false;
      const s=getComputedStyle(el);
      return !el.classList.contains('hidden') && s.display!=='none' && s.visibility!=='hidden';
    }catch(e){return false}
  }
  function tryStart(reason){
    try{
      if(!visibleCapture()) return false;
      if(window.useSimulation) return false;
      const rec=window.__BP_SESSION_RECORDER_INSTANCE__||window.sessionRecorder;
      if(rec && (rec.state==='recording'||rec.state==='paused')) return true;
      if(window.__BP_SESSION_RECORDER_STARTING__) return false;
      if(typeof window.startSessionRecorder!=='function') return false;
      if(!window.streamInstance || typeof window.streamInstance.getTracks!=='function') return false;
      const tracks=window.streamInstance.getTracks();
      if(!tracks.some(t=>t && t.readyState==='live')) return false;
      window.__BP_SESSION_RECORDER_STARTING__=true;
      window.__BP_C10_RECORDER_START_ATTEMPTS__++;
      const ok=window.startSessionRecorder();
      window.__BP_C10_RECORDER_START_TIME__=Date.now();
      window.__BP_C10_RECORDER_START_REASON__=reason||'watchdog';
      console.info('BoothPro C10 recorder start watchdog',reason||'watchdog',ok?'started':'requested');
      return !!ok;
    }catch(e){
      window.__BP_SESSION_RECORDER_ERROR__=e?.message||String(e);
      console.warn('BoothPro C10 recorder watchdog:',e);
      return false;
    }finally{
      window.__BP_SESSION_RECORDER_STARTING__=false;
    }
  }
  let wrapped=false;
  function installCaptureWrapper(){
    if(wrapped) return true;
    const fn=window.startCaptureSession;
    if(typeof fn!=='function') return false;
    window.__BP_C10_NATIVE_START_CAPTURE_SESSION__=fn;
    window.startCaptureSession=function(){
      const result=fn.apply(this,arguments);
      let n=0;
      const timer=setInterval(()=>{
        n++;
        if(tryStart('capture-session') || n>=100) clearInterval(timer);
      },100);
      return result;
    };
    wrapped=true;
    console.info('BoothPro C10 recorder-start watchdog active');
    return true;
  }
  const boot=setInterval(()=>{installCaptureWrapper();if(wrapped)clearInterval(boot)},100);
  setTimeout(()=>clearInterval(boot),20000);
  const globalWatch=setInterval(()=>{
    tryStart('global-capture-watch');
  },250);
  setTimeout(()=>clearInterval(globalWatch),30000);
})();
