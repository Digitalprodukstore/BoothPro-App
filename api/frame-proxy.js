const clean=v=>String(v??'').trim();
module.exports=async function(req,res){
 if(req.method!=='GET')return res.status(405).setHeader('Content-Type','application/json').send(JSON.stringify({ok:false,error:'Method tidak didukung.'}));
 try{
  const raw=clean(req.query?.url);if(!raw)throw new Error('URL frame tidak ada.');
  const u=new URL(raw);
  if(!['http:','https:'].includes(u.protocol))throw new Error('Sumber frame tidak valid.');
  const supabase=clean(process.env.SUPABASE_URL);const allowed=new Set();
  try{if(supabase)allowed.add(new URL(supabase).host)}catch(e){}
  if(!allowed.has(u.host))throw new Error('Sumber frame tidak diizinkan.');
  const upstream=await fetch(u.href,{headers:{Accept:'image/*'}});
  if(!upstream.ok)throw new Error('Frame tidak dapat diambil (HTTP '+upstream.status+').');
  const type=upstream.headers.get('content-type')||'image/png';
  if(!type.toLowerCase().startsWith('image/'))throw new Error('Sumber bukan file gambar.');
  const buf=Buffer.from(await upstream.arrayBuffer());
  res.status(200).setHeader('Content-Type',type).setHeader('Cache-Control','public, max-age=3600').setHeader('X-Content-Type-Options','nosniff').send(buf);
 }catch(e){res.status(400).setHeader('Content-Type','application/json').send(JSON.stringify({ok:false,error:e.message||String(e)}))}
};
