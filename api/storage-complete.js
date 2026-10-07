const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 try{
  const base=clean(process.env.SUPABASE_URL).replace(/\/$/,'');const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!base||!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  const b=req.body||{},sid=clean(b.sessionId),paths=Array.isArray(b.paths)?b.paths:[];
  const expected=[sid+'/photo.png',sid+'/animation.gif',sid+'/live-session.mp4'];
  if(!sid||expected.some(x=>!paths.includes(x)))throw new Error('Upload 3 file belum lengkap.');
  const h={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const row={session_id:sid,customer_name:'Pelanggan',photo_path:paths.find(x=>x.endsWith('/photo.png')),gif_path:paths.find(x=>x.endsWith('/animation.gif')),video_path:videoPath};
  const r=await fetch(base+'/rest/v1/sessions?on_conflict=session_id',{method:'POST',headers:{...h,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
  const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.message||d?.hint||'Gagal menyimpan metadata session.');
  return json(res,200,{ok:true,session:Array.isArray(d)?d[0]:d,paths:{photo:row.photo_path,gif:row.gif_path,video:row.video_path}});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};
