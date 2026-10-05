/* BoothPro P0 Direct Media Delivery + Live Video Recorder */
(function(){
  'use strict';
  const BP = window.BoothProDelivery = window.BoothProDelivery || {};
  BP.videoRecorder = null;
  BP.videoChunks = [];
  BP.videoBlob = null;
  BP.videoStartedAt = 0;
  BP.videoMaxTimer = null;
  BP.finalCompositeDataUrl = null;
  BP.setFinalComposite = function(data){ BP.finalCompositeDataUrl=data||null; };
  BP.deliveryBusy = false;
  BP.assets = { photoUrl:null, gifUrl:null, videoUrl:null };

  function el(id){ return document.getElementById(id); }
  function setStatus(msg, ok){
    const n=el('bpDeliveryStatus');
    if(n){ n.textContent=msg||''; n.className='text-xs mt-3 '+(ok?'text-emerald-400':'text-zinc-400'); }
  }
  function pickMime(){
    if(!window.MediaRecorder) return '';
    const types=['video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    return types.find(t=>MediaRecorder.isTypeSupported(t))||'';
  }
  BP.startRecording = function(stream){
    if(!stream || !window.MediaRecorder || BP.videoRecorder) return false;
    const mime=pickMime();
    if(!mime) return false;
    try{
      BP.videoChunks=[];
      BP.videoBlob=null;
      BP.videoStartedAt=Date.now();
      BP.videoRecorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});
      BP.videoRecorder.ondataavailable=function(e){ if(e.data&&e.data.size) BP.videoChunks.push(e.data); };
      BP.videoRecorder.onstop=function(){
        const type=BP.videoRecorder?.mimeType||mime;
        BP.videoBlob=BP.videoChunks.length?new Blob(BP.videoChunks,{type}):null;
        BP.videoChunks=[];
        BP.videoRecorder=null;
        if(BP.videoMaxTimer){clearTimeout(BP.videoMaxTimer);BP.videoMaxTimer=null;}
        BP.updateIndicator();
      };
      BP.videoRecorder.start(1000);
      BP.videoMaxTimer=setTimeout(function(){BP.stopRecording();},90000);
      BP.updateIndicator();
      return true;
    }catch(e){ BP.videoRecorder=null; return false; }
  };
  BP.stopRecording=function(){
    try{
      if(BP.videoRecorder && BP.videoRecorder.state!=='inactive') BP.videoRecorder.stop();
    }catch(e){}
    if(BP.videoMaxTimer){clearTimeout(BP.videoMaxTimer);BP.videoMaxTimer=null;}
  };
  BP.updateIndicator=function(){
    const n=el('bpVideoIndicator');
    if(!n) return;
    if(BP.videoRecorder){n.textContent='● LIVE VIDEO direkam';n.className='text-[10px] font-bold text-red-400';}
    else if(BP.videoBlob){n.textContent='✓ LIVE VIDEO siap';n.className='text-[10px] font-bold text-emerald-400';}
    else{n.textContent='LIVE VIDEO opsional';n.className='text-[10px] text-zinc-500';}
  };

  function ensurePanel(){
    if(el('bpDeliveryPanel')) return;
    const resultCandidates=['#step-output','#step-result','#step-final','#step-share'];
    let host=null;
    for(const s of resultCandidates){host=document.querySelector(s);if(host)break;}
    if(!host){
      const nodes=[...document.querySelectorAll('section')];
      host=nodes.find(x=>/QR Soft File|Upload Soft File ke Cloud/i.test(x.innerText||''));
    }
    if(!host) return;
    const panel=document.createElement('div');
    panel.id='bpDeliveryPanel';
    panel.className='mt-5 border-t border-zinc-800 pt-5';
    panel.innerHTML=
      '<div class="flex items-center justify-between gap-3">'+
        '<div><div class="font-bold">Kirim Soft File Langsung</div><p class="text-xs text-zinc-500 mt-1">Foto final + GIF + video sesi dikirim sebagai media/file.</p></div>'+
        '<span id="bpVideoIndicator" class="text-[10px] text-zinc-500">LIVE VIDEO opsional</span>'+
      '</div>'+
      '<div class="grid md:grid-cols-2 gap-3 mt-4">'+
        '<div><label class="text-xs text-zinc-400">WhatsApp</label><input id="bpWaPhone" inputmode="tel" autocomplete="tel" class="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-sm" placeholder="08xxxxxxxxxx"></div>'+
        '<div><label class="text-xs text-zinc-400">Email</label><input id="bpEmail" type="email" autocomplete="email" class="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-sm" placeholder="customer@email.com"></div>'+
      '</div>'+
      '<div class="grid grid-cols-2 gap-2 mt-3">'+
        '<button id="bpSendWa" type="button" class="py-3 rounded-xl bg-emerald-600 font-bold text-sm">Kirim WhatsApp</button>'+
        '<button id="bpSendEmail" type="button" class="py-3 rounded-xl bg-indigo-600 font-bold text-sm">Kirim Email</button>'+
      '</div>'+
      '<p id="bpDeliveryStatus" class="text-xs mt-3 text-zinc-400"></p>'+
      '<p class="text-[10px] text-zinc-600 mt-2">Jika pengiriman langsung belum dikonfigurasi, QR Soft File tetap tersedia sebagai fallback.</p>';
    host.appendChild(panel);
    el('bpSendWa').onclick=()=>BP.sendWhatsApp();
    el('bpSendEmail').onclick=()=>BP.sendEmail();
    BP.updateIndicator();
  }

  function toMp4Url(url){
    if(!url) return null;
    return url.replace('/upload/','/upload/f_mp4/').replace(/\\.(webm|mkv|mov)(\\?.*)?$/i,'.mp4$2');
  }
  async function blobToDataUrl(blob){
    return await new Promise((resolve,reject)=>{
      const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);
    });
  }
  async function uploadVideo(){
    if(BP.assets.videoUrl) return BP.assets.videoUrl;
    if(!BP.videoBlob) return null;
    if(typeof uploadDataUrlToCloudinary!=='function') throw new Error('Upload Cloudinary belum tersedia');
    const data=await blobToDataUrl(BP.videoBlob);
    const up=await uploadDataUrlToCloudinary(data,'video');
    const raw=up.secure_url||up.url;
    BP.assets.videoUrl=toMp4Url(raw)||raw;
    return BP.assets.videoUrl;
  }
  async function prepareAssets(){
    const finalData=BP.finalCompositeDataUrl;
    if(!finalData) throw new Error('Foto final belum siap');
    if(!BP.assets.photoUrl){
      const up=await uploadDataUrlToCloudinary(finalData,'image');
      BP.assets.photoUrl=up.secure_url||up.url;
    }
    if(!BP.assets.gifUrl && typeof generateGifBlob==='function'){
      const blob=await generateGifBlob();
      const data=await blobToDataUrl(blob);
      const up=await uploadDataUrlToCloudinary(data,'image');
      BP.assets.gifUrl=up.secure_url||up.url;
      if(!window.finalGifDataUrl) window.finalGifDataUrl=URL.createObjectURL(blob);
    }
    await uploadVideo();
    return BP.assets;
  }
  async function post(url,body){
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||('Request gagal ('+r.status+')'));
    return data;
  }
  BP.sendWhatsApp=async function(){
    if(BP.deliveryBusy)return;
    const phone=(el('bpWaPhone')?.value||'').trim();
    if(!phone){setStatus('Masukkan nomor WhatsApp customer.',false);return;}
    BP.deliveryBusy=true;setStatus('Menyiapkan Foto + GIF + Live Video...',false);
    try{
      const a=await prepareAssets();
      const media=[{type:'image',url:a.photoUrl,filename:'BoothPro-Final.jpg'},{type:'document',url:a.gifUrl,filename:'BoothPro-GIF.gif'}];
      if(a.videoUrl)media.push({type:'video',url:a.videoUrl,filename:'BoothPro-Live.mp4'});
      await post('/api/delivery/whatsapp',{to:phone,sessionId:window.sessionId||'',media});
      setStatus('✓ WhatsApp berhasil dikirim sebagai media/file.',true);
    }catch(e){setStatus('WhatsApp gagal: '+e.message,false);}
    finally{BP.deliveryBusy=false;}
  };
  BP.sendEmail=async function(){
    if(BP.deliveryBusy)return;
    const email=(el('bpEmail')?.value||'').trim();
    if(!email){setStatus('Masukkan email customer.',false);return;}
    BP.deliveryBusy=true;setStatus('Menyiapkan lampiran Foto + GIF + Live Video...',false);
    try{
      const a=await prepareAssets();
      const attachments=[{url:a.photoUrl,filename:'BoothPro-Final.jpg'},{url:a.gifUrl,filename:'BoothPro-GIF.gif'}];
      if(a.videoUrl)attachments.push({url:a.videoUrl,filename:'BoothPro-Live.mp4'});
      await post('/api/delivery/email',{to:email,sessionId:window.sessionId||'',attachments});
      setStatus('✓ Email berhasil dikirim dengan lampiran.',true);
    }catch(e){setStatus('Email gagal: '+e.message,false);}
    finally{BP.deliveryBusy=false;}
  };

  document.addEventListener('DOMContentLoaded',function(){setTimeout(ensurePanel,100);});
  setTimeout(ensurePanel,500);
})();
