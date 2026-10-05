/** BoothPro customer Soft File session API. */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));
const env=k=>String(process.env[k]||'').trim();
const base=()=>env('SUPABASE_URL').replace(/\/$/,'');
const service=()=>env('SUPABASE_SERVICE_ROLE_KEY');
async function supa(path,opts={}){
  const b=base(),key=service();
  if(!b||!key)throw new Error('Supabase server environment belum dikonfigurasi.');
  const headers={apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json',Prefer:opts.prefer||'return=representation'};
  const r=await fetch(b+'/rest/v1/'+path,{method:opts.method||'GET',headers,body:opts.body===undefined?undefined:JSON.stringify(opts.body)});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(d?.message||d?.hint||d?.details||'Supabase request gagal (HTTP '+r.status+')');
  return d||[];
}
function viewerUrl(req,sid){const origin=env('BOOTHPRO_SHARE_ORIGIN')||('https://'+String(req.headers.host||'').trim());return origin.replace(/\/$/,'')+'/share.html?session='+encodeURIComponent(sid)}
module.exports=async function handler(req,res){
 try{
  const sid=String(req.query?.session||req.body?.sessionId||'').trim();
  if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});
  if(req.method==='GET'){
   const rows=await supa('boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&media_status=neq.deleted&select=session_id,booth_id,package_name,photo_url,gif_url,video_url,expires_at,media_status,updated_at&limit=1');
   const row=Array.isArray(rows)?rows[0]:null;
   if(!row)return json(res,404,{ok:false,error:'Soft file tidak ditemukan atau sudah kedaluwarsa.'});
   if(row.expires_at&&Date.now()>Date.parse(row.expires_at))return json(res,410,{ok:false,error:'Soft file sudah kedaluwarsa.'});
   return json(res,200,{ok:true,session:row});
  }
  if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
  const b=req.body||{}, owner=String(b.user_id||b.workspace_id||'public').trim()||'public';
  const payload={user_id:owner,workspace_id:String(b.workspace_id||b.user_id||owner),booth_id:String(b.boothId||b.booth_id||'BOOTH-DEFAULT'),session_id:sid,package_id:String(b.package_id||''),package_name:String(b.package_name||''),photo_url:b.photoUrl||b.photo_url||null,photo_public_id:b.photoPublicId||b.photo_public_id||null,gif_url:b.gifUrl||b.gif_url||null,gif_public_id:b.gifPublicId||b.gif_public_id||null,video_url:b.videoUrl||b.video_url||null,video_public_id:b.videoPublicId||b.video_public_id||null,media_status:'uploaded',download_status:'pending',expires_at:b.expires_at||new Date(Date.now()+7*24*60*60*1000).toISOString(),updated_at:new Date().toISOString()};
  const rows=await supa('boothpro_session_manifest?on_conflict=user_id,booth_id,session_id',{method:'POST',body:payload,prefer:'resolution=merge-duplicates,return=representation'});
  const row=Array.isArray(rows)?rows[0]:rows;
  return json(res,200,{ok:true,shareUrl:viewerUrl(req,sid),session:row});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};
