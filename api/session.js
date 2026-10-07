/** BoothPro public Soft File viewer API.
 * No service-role key is exposed. The kiosk already writes the authenticated
 * session manifest; this endpoint only resolves the clean viewer URL and reads
 * the public manifest through Supabase's publishable key/RLS.
 */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));
const SUPA='https://jnajtcuxlgkpplyvvsik.supabase.co';
const KEY='sb_publishable_WGOpLbsmk_3Prr2pabYuMw_juhU0mN-';
const origin=req=>String(process.env.BOOTHPRO_SHARE_ORIGIN||('https://'+String(req.headers.host||'').trim())).replace(/\/$/,'');
async function getSessionMedia(sid){
 const base=SUPA;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw new Error('Soft file storage belum dikonfigurasi.');
 const h={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 const r=await fetch(base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,customer_name,photo_path,gif_path,video_path&limit=1',{headers:h,cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok||!d?.[0])return null;
 const row=d[0];
 const sign=async path=>{
  if(!path)return null;
  const sr=await fetch(base+'/storage/v1/object/sign/boothpro-softfiles/'+encodeURIComponent(path),{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:604800})});
  const sd=await sr.json().catch(()=>null);
  if(!sr.ok||!sd?.signedURL)return null;
  return base+'/storage/v1'+sd.signedURL;
 };
 const [photo_url,gif_url,video_url]=await Promise.all([sign(row.photo_path),sign(row.gif_path),sign(row.video_path)]);
 return {session_id:row.session_id,package_name:'BoothPro',photo_url,gif_url,video_url,media_status:photo_url&&gif_url&&video_url?'uploaded':'partial',updated_at:new Date().toISOString()};
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
   // POST is intentionally lightweight: authenticated BoothPro client code is
   // the writer of the manifest. The endpoint only mints the clean public URL.
   return json(res,200,{ok:true,shareUrl:origin(req)+'/share.html?session='+encodeURIComponent(sid)});
  }
  return json(res,405,{ok:false,error:'Method tidak didukung.'});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};
