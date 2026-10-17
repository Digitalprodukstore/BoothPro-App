const clean=v=>String(v??'').trim();
const json=(res,status,b)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(b));
async function signed(base,key,path){const r=await fetch(base+'/storage/v1/object/sign/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:86400})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.signedURL)throw new Error('Gagal membuat link download.');return base+'/storage/v1'+d.signedURL}
module.exports=async function(req,res){
 if(req.method!=='GET')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 const id=clean(req.query?.id||req.query?.session);if(!id)return json(res,400,{ok:false,error:'Session ID wajib.'});
 try{const base=clean(process.env.SUPABASE_URL).replace(/\/$/,''),key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!base||!key)throw new Error('Supabase server environment belum dikonfigurasi.');
 const h={apikey:key,Authorization:'Bearer '+key},u=base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(id)+'&select=session_id,customer_name,photo_path,gif_path,video_path&limit=1';const r=await fetch(u,{headers:h,cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||!d?.[0])return json(res,404,{ok:false,error:'Soft file session tidak ditemukan.'});
 const s=d[0];if(!s.photo_path||!s.gif_path||!s.video_path)return json(res,409,{ok:false,error:'Bundle soft file belum lengkap.'});
 const [photo,gif,video]=await Promise.all([signed(base,key,s.photo_path),signed(base,key,s.gif_path),signed(base,key,s.video_path)]);
 return json(res,200,{ok:true,session:{...s,photo_path:photo,gif_path:gif,video_path:video}});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};