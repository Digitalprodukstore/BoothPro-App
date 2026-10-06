const clean=v=>String(v??'').trim();
module.exports=async function(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Method tidak didukung.'});
  const id=clean(req.query?.id||req.query?.session);
  if(!id) return res.status(400).json({ok:false,error:'Session ID wajib.'});
  try{
    const base=clean(process.env.SUPABASE_URL).replace(/\/$/,'');
    const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if(!base||!key) throw new Error('Supabase server environment belum dikonfigurasi.');
    const u=base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(id)+'&select=session_id,customer_name,photo_path,gif_path,video_path&limit=1';
    const r=await fetch(u,{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.[0]) return res.status(404).json({ok:false,error:'Soft file session tidak ditemukan.'});
    return res.status(200).json({ok:true,session:d[0]});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)})}
};
