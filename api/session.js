/** BoothPro public Soft File viewer and operator config API.
 * /api/session reads the public soft-file manifest.
 * /api/config is rewritten to this handler to stay within Vercel Hobby's function limit.
 */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').setHeader('Cache-Control','no-store').send(JSON.stringify(body));
const SUPA='https://jnajtcuxlgkpplyvvsik.supabase.co';
const origin=req=>String(process.env.BOOTHPRO_SHARE_ORIGIN||('https://'+String(req.headers.host||'').trim())).replace(/\/$/,'');
const safeKeys=[
 'brandName','tagline','logoUrl','coverImageUrl','accentColor','welcomeHeadline','welcomeSubheadline',
 'packages','extraPrintPrice','maxRetakes','countdownSeconds','qrisMerchantName','qrisNmid','qrisStaticQrUrl',
 'voucherCodes','printerPaperSize','printerAutoPrint','kioskTimeoutSeconds'
];
const clean=v=>String(v??'').trim();
const configBase=()=>clean(process.env.SUPABASE_URL||SUPA).replace(/\/+$/,'');
const configHeaders=()=>{
 const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
 if(!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur di Vercel.');
 return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
};
const safeConfig=value=>{
 const out={};
 for(const key of safeKeys)if(Object.prototype.hasOwnProperty.call(value||{},key))out[key]=value[key];
 return out;
};
async function handleConfig(req,res){
 if(!['GET','PUT','OPTIONS'].includes(req.method))return json(res,405,{success:false,message:'Method tidak didukung.'});
 if(req.method==='OPTIONS')return res.status(204).end();
 try{
  if(!clean(process.env.SUPABASE_URL))return json(res,503,{success:false,message:'SUPABASE_URL belum diatur pada environment Vercel.'});
  if(req.method==='GET'){
   const r=await fetch(configBase()+'/rest/v1/boothpro_operator_config?id=eq.1&select=config,updated_at&limit=1',{headers:configHeaders(),cache:'no-store'});
   const data=await r.json().catch(()=>null);
   if(!r.ok)throw new Error(data?.message||'Gagal membaca konfigurasi cloud (HTTP '+r.status+').');
   const row=Array.isArray(data)&&data[0]?data[0]:null;
   return json(res,200,{success:true,configured:Boolean(row),config:row?safeConfig(row.config):null,updatedAt:row?.updated_at||null});
  }
  const expected=clean(process.env.BOOTHPRO_ADMIN_PIN);
  const supplied=clean(req.headers['x-boothpro-admin-pin']);
  if(!expected||expected.length<4)return json(res,503,{success:false,message:'Atur BOOTHPRO_ADMIN_PIN minimal 4 karakter (disarankan 6 digit/karakter) di Vercel sebelum mengaktifkan simpan cloud.'});
  if(!supplied||supplied!==expected)return json(res,401,{success:false,message:'Otorisasi Dashboard ditolak. PIN server tidak cocok.'});
  const config=safeConfig(req.body?.config);
  if(!Object.keys(config).length)return json(res,400,{success:false,message:'Konfigurasi publik kosong atau tidak valid.'});
  const r=await fetch(configBase()+'/rest/v1/boothpro_operator_config?on_conflict=id',{
   method:'POST',headers:{...configHeaders(),Prefer:'resolution=merge-duplicates,return=representation'},
   body:JSON.stringify({id:1,config,updated_at:new Date().toISOString()})
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok)return json(res,502,{success:false,message:data?.message||data?.hint||'Supabase menolak penyimpanan konfigurasi (HTTP '+r.status+').' });
  return json(res,200,{success:true,message:'Konfigurasi publik berhasil disimpan ke Supabase.',updatedAt:data?.[0]?.updated_at||null});
 }catch(e){return json(res,502,{success:false,message:e instanceof Error?e.message:'Kesalahan sinkronisasi cloud.'});}
}
async function getSessionMedia(sid){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)throw new Error('Soft file storage belum dikonfigurasi.');
 const h={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};
 const url=SUPA+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,package_name,photo_url,gif_url,video_url,media_status,expires_at,updated_at&order=updated_at.desc&limit=1';
 const r=await fetch(url,{headers:h,cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok||!Array.isArray(d)||!d[0])return null;
 const row=d[0],photo_url=String(row.photo_url||'').trim()||null,gif_url=String(row.gif_url||'').trim()||null,video_url=String(row.video_url||'').trim()||null;
 return {session_id:row.session_id,package_name:row.package_name||'BoothPro',photo_url,gif_url,video_url,media_status:photo_url&&gif_url&&video_url?'uploaded':'partial',expires_at:row.expires_at||null,updated_at:row.updated_at||null};
}
module.exports=async function handler(req,res){
 try{
  if(req.query?.route==='config')return await handleConfig(req,res);
  const sid=String(req.query?.session||req.body?.sessionId||'').trim();
  if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});
  if(req.method==='GET'){
   const row=await getSessionMedia(sid);
   if(!row)return json(res,404,{ok:false,error:'Soft file tidak ditemukan. Pastikan sinkronisasi sudah selesai.'});
   if(row.expires_at&&Date.now()>Date.parse(row.expires_at))return json(res,410,{ok:false,error:'Soft file sudah kedaluwarsa.'});
   return json(res,200,{ok:true,session:row});
  }
  if(req.method==='POST')return json(res,200,{ok:true,shareUrl:origin(req)+'/share.html?session='+encodeURIComponent(sid)});
  return json(res,405,{ok:false,error:'Method tidak didukung.'});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)});}
};
