const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 try{
  const base=clean(process.env.SUPABASE_URL).replace(/\/$/,'');
  const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!base||!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  const b=req.body||{},sid=clean(b.sessionId),files=Array.isArray(b.files)?b.files:[];
  if(!sid||files.length!==3)throw new Error('Session ID dan tepat 3 file wajib.');
  const allowed={'photo.png':'image/png','animation.gif':'image/gif','live-session.mp4':'video/mp4'};
  const uploads=await Promise.all(files.map(async f=>{
   const name=clean(f.name);if(!allowed[name]||f.contentType!==allowed[name])throw new Error('Tipe file tidak valid: '+name);
   const path=sid+'/'+name;
   const u=base+'/storage/v1/object/upload/sign/boothpro-softfiles/'+encodeURIComponent(path);
   const r=await fetch(u,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600})});
   const d=await r.json().catch(()=>null);if(!r.ok||!d?.signedURL)throw new Error('Gagal membuat URL upload '+name);
   return {name,path,uploadUrl:base+'/storage/v1'+d.signedURL};
  }));
  return json(res,200,{ok:true,uploads});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};
