/** BoothPro public Soft File viewer API.
 * No service-role key is exposed. The kiosk already writes the authenticated
 * session manifest; this endpoint only resolves the clean viewer URL and reads
 * the public manifest through Supabase's publishable key/RLS.
 */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));
const SUPA='https://jnajtcuxlgkpplyvvsik.supabase.co';
const KEY='sb_publishable_WGOpLbsmk_3Prr2pabYuMw_juhU0mN-';
const origin=req=>String(process.env.BOOTHPRO_SHARE_ORIGIN||('https://'+String(req.headers.host||'').trim())).replace(/\/$/,'');
async function getManifest(sid){
 const url=SUPA+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&media_status=neq.deleted&select=session_id,booth_id,package_name,photo_url,gif_url,video_url,expires_at,media_status,updated_at&limit=1';
 const r=await fetch(url,{headers:{apikey:KEY,Accept:'application/json'},cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||d?.hint||d?.details||'Manifest tidak dapat dibaca.');
 return Array.isArray(d)?d[0]:null;
}
module.exports=async function handler(req,res){
 try{
  const sid=String(req.query?.session||req.body?.sessionId||'').trim();
  if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});
  if(req.method==='GET'){
   const row=await getManifest(sid);
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
