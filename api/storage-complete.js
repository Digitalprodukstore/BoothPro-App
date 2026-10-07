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
  const photoPath=sid+'/photo.png';
  const gifPath=sid+'/animation.gif';
  const videoPathWebm=sid+'/live-session.webm';
  const videoPathMp4=sid+'/live-session.mp4';
  if(!paths.includes(photoPath)||!paths.includes(gifPath)||(!paths.includes(videoPathWebm)&&!paths.includes(videoPathMp4))){
    throw new Error('Upload 3 file belum lengkap. Wajib Foto Final + GIF + Live Video.');
  }
  const videoPath=paths.includes(videoPathWebm)?videoPathWebm:videoPathMp4;

  const h={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const publicUrl=path=>base+'/storage/v1/object/public/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/');

  // Keep the legacy sessions row populated for existing delivery code,
  // but make the manifest the canonical source for the public soft-file bundle.
  const sessionRow={
    session_id:sid,
    customer_name:'Pelanggan',
    photo_path:photoPath,
    gif_path:gifPath,
    video_path:videoPath
  };
  const sr=await fetch(base+'/rest/v1/sessions?on_conflict=session_id',{
    method:'POST',
    headers:{...h,Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(sessionRow)
  });
  const sd=await sr.json().catch(()=>null);
  if(!sr.ok)throw new Error(sd?.message||sd?.hint||'Gagal menyimpan metadata session.');

  const manifest={
    session_id:sid,
    photo_url:publicUrl(photoPath),
    gif_url:publicUrl(gifPath),
    video_url:publicUrl(videoPath),
    media_status:'uploaded',
    download_status:'pending',
    updated_at:new Date().toISOString()
  };
  const mr=await fetch(base+'/rest/v1/boothpro_session_manifest?on_conflict=session_id',{
    method:'POST',
    headers:{...h,Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(manifest)
  });
  const md=await mr.json().catch(()=>null);
  if(!mr.ok)throw new Error(md?.message||md?.hint||'Gagal menyimpan manifest 3 soft file.');

  return json(res,200,{
    ok:true,
    session:Array.isArray(sd)?sd[0]:sd,
    paths:{photo:photoPath,gif:gifPath,video:videoPath},
    media:{
      photoUrl:manifest.photo_url,
      gifUrl:manifest.gif_url,
      videoUrl:manifest.video_url
    }
  });
 }catch(e){
  return json(res,500,{ok:false,error:e.message||String(e)})
 }
};