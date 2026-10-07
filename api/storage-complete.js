const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 try{
  const base=clean(process.env.SUPABASE_URL).replace(/\/$/,'');
  const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!base||!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  const b=req.body||{},sid=clean(b.sessionId),paths=Array.isArray(b.paths)?b.paths.map(clean):[];
  if(!sid)throw new Error('Session ID wajib.');
  const photoPath=sid+'/photo.png',gifPath=sid+'/animation.gif',webm=sid+'/live-session.webm',mp4=sid+'/live-session.mp4';
  if(!paths.includes(photoPath)||!paths.includes(gifPath)||(!paths.includes(webm)&&!paths.includes(mp4)))throw new Error('Upload 3 file belum lengkap. Wajib Foto Final + GIF + Live Video.');
  const videoPath=paths.includes(webm)?webm:mp4;
  const h={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const publicUrl=p=>base+'/storage/v1/object/public/boothpro-softfiles/'+p.split('/').map(encodeURIComponent).join('/');
  const media={photo_url:publicUrl(photoPath),gif_url:publicUrl(gifPath),video_url:publicUrl(videoPath),media_status:'uploaded',download_status:'pending',updated_at:new Date().toISOString()};
  const verify=async p=>{const vr=await fetch(base+'/storage/v1/object/info/boothpro-softfiles/'+p.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store'});return vr.ok};
  const verified=await Promise.all([verify(photoPath),verify(gifPath),verify(videoPath)]);
  if(verified.some(v=>!v))throw new Error('Supabase belum memastikan ketiga file soft file tersedia.');
  const lookup=await fetch(base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id&limit=1',{headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},cache:'no-store'});
  const existing=await lookup.json().catch(()=>null);
  if(!lookup.ok)throw new Error(existing?.message||existing?.hint||'Gagal membaca manifest soft file.');
  let saved;
  if(Array.isArray(existing)&&existing[0]){
   const mr=await fetch(base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid),{method:'PATCH',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(media)});
   saved=await mr.json().catch(()=>null);
   if(!mr.ok)throw new Error(saved?.message||saved?.hint||'Gagal memperbarui manifest 3 soft file.');
  }else{
   const mr=await fetch(base+'/rest/v1/boothpro_session_manifest',{method:'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify({session_id:sid,...media})});
   saved=await mr.json().catch(()=>null);
   if(!mr.ok)throw new Error(saved?.message||saved?.hint||'Gagal membuat manifest 3 soft file.');
  }
  const origin=clean(process.env.BOOTHPRO_PUBLIC_ORIGIN)||((req.headers['x-forwarded-proto']||'https')+'://'+(req.headers['x-forwarded-host']||req.headers.host));
  const bundleUrl=origin.replace(/\/$/,'')+'/api/softfile?sessionId='+encodeURIComponent(sid);
  return json(res,200,{ok:true,bundleReady:true,bundleUrl,paths:{photo:photoPath,gif:gifPath,video:videoPath},media:{photoUrl:media.photo_url,gifUrl:media.gif_url,videoUrl:media.video_url},manifest:Array.isArray(saved)?saved[0]:saved});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};