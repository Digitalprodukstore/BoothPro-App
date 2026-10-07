const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
const signedUrl=(base,value)=>{
 const raw=clean(value);
 if(/^https?:\/\//i.test(raw))return raw;
 if(raw.startsWith('/storage/v1/'))return base+raw;
 if(raw.startsWith('/object/'))return base+'/storage/v1'+raw;
 throw new Error('URL upload Supabase tidak valid.');
};
module.exports=async function(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 try{
  const base=clean(process.env.SUPABASE_URL).replace(/\/$/,'');
  const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if(!base||!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  const b=req.body||{},sid=clean(b.sessionId),files=Array.isArray(b.files)?b.files:[];
  if(!sid||files.length!==3)throw new Error('Session ID dan tepat 3 file wajib.');
  const allowed={'photo.png':'image/png','animation.gif':'image/gif','live-session.mp4':'video/mp4','live-session.webm':'video/webm'};
  const uploads=await Promise.all(files.map(async f=>{
   const name=clean(f.name);if(!allowed[name]||f.contentType!==allowed[name])throw new Error('Tipe file tidak valid: '+name);
   const path=sid+'/'+name;
   const encodedPath=path.split('/').map(encodeURIComponent).join('/');
   const u=base+'/storage/v1/object/upload/sign/boothpro-softfiles/'+encodedPath;
   const r=await fetch(u,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600,upsert:true})});
   const d=await r.json().catch(()=>null);if(!r.ok)throw new Error('Gagal membuat URL upload '+name+(d?.message?': '+d.message:''));
   const raw=d?.signedURL||d?.signedUrl||d?.url;
   if(!raw)throw new Error('Supabase tidak mengembalikan signed upload URL untuk '+name+'.');
   return {name,path,uploadUrl:signedUrl(base,raw)};
  }));
  return json(res,200,{ok:true,uploads});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};