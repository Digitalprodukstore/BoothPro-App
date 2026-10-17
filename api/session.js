/** BoothPro public Soft File viewer API.
 * The kiosk publishes the final photo/GIF/video URLs to boothpro_session_manifest.
 * This endpoint reads that same source of truth so the public share page exposes
 * the complete 3-media bundle.
 */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));
const SUPA='https://jnajtcuxlgkpplyvvsik.supabase.co';
const origin=req=>String(process.env.BOOTHPRO_SHARE_ORIGIN||('https://'+String(req.headers.host||'').trim())).replace(/\/$/,'');
async function getSessionMedia(sid){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw new Error('Soft file storage belum dikonfigurasi.');
 const h={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 const url=SUPA+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,package_name,photo_url,gif_url,video_url,media_status,expires_at,updated_at&order=updated_at.desc&limit=1';
 const r=await fetch(url,{headers:h,cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok||!Array.isArray(d)||!d[0])return null;
 const row=d[0];
 const photo_url=String(row.photo_url||'').trim()||null;
 const gif_url=String(row.gif_url||'').trim()||null;
 const video_url=String(row.video_url||'').trim()||null;
 return {
  session_id:row.session_id,
  package_name:row.package_name||'BoothPro',
  photo_url,gif_url,video_url,
  media_status:photo_url&&gif_url&&video_url?'uploaded':'partial',
  expires_at:row.expires_at||null,
  updated_at:row.updated_at||null
 };
}
module.exports=async function handler(req,res){
 try{
  const sid=String(req.query?.session||req.body?.sessionId||'').trim();
  if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});
  if(req.method==='GET'){
   const row=await getSessionMedia(sid);
   if(!row)return json(res,404,{ok:false,error:'Soft file tidak ditemukan. Pastikan sinkronisasi sudah selesai.'});
   if(row.expires_at&&Date.now()>Date.parse(row.expires_at))return json(res,410,{ok:false,error:'Soft file sudah kedaluwarsa.'});
   return json(res,200,{ok:true,session:row});
  }
  if(req.method==='POST'){
   return json(res,200,{ok:true,shareUrl:origin(req)+'/share.html?session='+encodeURIComponent(sid)});
  }
  return json(res,405,{ok:false,error:'Method tidak didukung.'});
 }catch(e){
  return json(res,500,{ok:false,error:e.message||String(e)});
 }
};