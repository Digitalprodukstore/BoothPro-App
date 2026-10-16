/** BoothPro public Soft File viewer and operator config API. */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').setHeader('Cache-Control','no-store').send(JSON.stringify(body));
const SUPA='https://jnajtcuxlgkpplyvvsik.supabase.co';
const origin=req=>String(process.env.BOOTHPRO_SHARE_ORIGIN||('https://'+String(req.headers.host||'').trim())).replace(/\/$/,'');
const safeKeys=['brandName','tagline','logoUrl','coverImageUrl','accentColor','welcomeHeadline','welcomeSubheadline','packages','extraPrintPrice','maxRetakes','countdownSeconds','qrisMerchantName','qrisNmid','qrisStaticQrUrl','voucherCodes','printerPaperSize','printerAutoPrint','kioskTimeoutSeconds'];
const clean=v=>String(v??'').trim();
const configBase=()=>clean(process.env.SUPABASE_URL||SUPA).replace(/\/+$/,'');
const configHeaders=()=>{const key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur di Vercel.');return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};};
const safeConfig=value=>{const out={};for(const key of safeKeys)if(Object.prototype.hasOwnProperty.call(value||{},key))out[key]=value[key];return out;};
async function handleConfig(req,res){
 if(!['GET','PUT','OPTIONS'].includes(req.method))return json(res,405,{success:false,message:'Method tidak didukung.'});
 if(req.method==='OPTIONS')return res.status(204).end();
 try{
  if(!clean(process.env.SUPABASE_URL))return json(res,503,{success:false,message:'SUPABASE_URL belum diatur pada environment Vercel.'});
  if(req.method==='GET'){
   const r=await fetch(configBase()+'/rest/v1/boothpro_operator_config?id=eq.1&select=config,updated_at&limit=1',{headers:configHeaders(),cache:'no-store'});
   const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.message||'Gagal membaca konfigurasi cloud (HTTP '+r.status+').');
   const row=Array.isArray(data)&&data[0]?data[0]:null;return json(res,200,{success:true,configured:Boolean(row),config:row?safeConfig(row.config):null,updatedAt:row?.updated_at||null});
  }
  const expected=clean(process.env.BOOTHPRO_ADMIN_PIN),supplied=clean(req.headers['x-boothpro-admin-pin']);
  if(!expected||expected.length<4)return json(res,503,{success:false,message:'Atur BOOTHPRO_ADMIN_PIN minimal 4 karakter di Vercel.'});
  if(!supplied||supplied!==expected)return json(res,401,{success:false,message:'Otorisasi Dashboard ditolak. PIN server tidak cocok.'});
  const config=safeConfig(req.body?.config);if(!Object.keys(config).length)return json(res,400,{success:false,message:'Konfigurasi publik kosong atau tidak valid.'});
  const r=await fetch(configBase()+'/rest/v1/boothpro_operator_config?on_conflict=id',{method:'POST',headers:{...configHeaders(),Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:1,config,updated_at:new Date().toISOString()})});
  const data=await r.json().catch(()=>null);if(!r.ok)return json(res,502,{success:false,message:data?.message||data?.hint||'Supabase menolak penyimpanan konfigurasi (HTTP '+r.status+').'});
  return json(res,200,{success:true,message:'Konfigurasi publik berhasil disimpan ke Supabase.',updatedAt:data?.[0]?.updated_at||null});
 }catch(e){return json(res,502,{success:false,message:e instanceof Error?e.message:'Kesalahan sinkronisasi cloud.'});}
}
const validSessionId=sid=>/^[a-zA-Z0-9_-]{8,100}$/.test(String(sid||''));
async function handleSoftfileUpload(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 const sid=clean(req.body?.sessionId),action=clean(req.body?.action),media=clean(req.body?.media);if(!validSessionId(sid))return json(res,400,{ok:false,error:'Session ID tidak valid.'});if(!['photo','gif','video'].includes(media))return json(res,400,{ok:false,error:'Jenis media tidak valid.'});
 try{
  const base=configBase(),key=clean(process.env.SUPABASE_SERVICE_ROLE_KEY);if(!key)throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
  const h={apikey:key,Authorization:'Bearer '+key,Accept:'application/json','Content-Type':'application/json'};
  const ext=media==='photo'?'photo.png':media==='gif'?'animation.gif':(clean(req.body?.mimeType).includes('mp4')?'live-session.mp4':'live-session.webm');const path=sid+'/'+ext;
  if(action==='sign'){
   const sign=await fetch(base+'/storage/v1/object/upload/sign/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:h,body:JSON.stringify({upsert:true}),cache:'no-store'});const data=await sign.json().catch(()=>null);if(!sign.ok)throw new Error(data?.message||data?.error||'Gagal membuat URL upload aman. Pastikan bucket boothpro-softfiles tersedia.');const token=clean(data?.token);if(!token)throw new Error('Supabase tidak mengembalikan token upload.');return json(res,200,{ok:true,path,uploadUrl:base+'/storage/v1/object/upload/sign/boothpro-softfiles/'+path.split('/').map(encodeURIComponent).join('/')+'?token='+encodeURIComponent(token)});
  }
  if(action==='complete'){
   const photo=sid+'/photo.png',gif=sid+'/animation.gif';const [p,g]=await Promise.all([photo,gif].map(async p=>{const r=await fetch(base+'/storage/v1/object/info/boothpro-softfiles/'+p.split('/').map(encodeURIComponent).join('/'),{headers:h,cache:'no-store'});return r.ok;}));const videoExt=clean(req.body?.mimeType).includes('mp4')?'live-session.mp4':'live-session.webm',video=sid+'/'+videoExt;const vr=await fetch(base+'/storage/v1/object/info/boothpro-softfiles/'+video.split('/').map(encodeURIComponent).join('/'),{headers:h,cache:'no-store'});if(!p||!g||!vr.ok)return json(res,409,{ok:false,error:'Belum semua media terunggah.'});
   const publicUrl=p=>base+'/storage/v1/object/public/boothpro-softfiles/'+p.split('/').map(encodeURIComponent).join('/');
   const ownerUserId=clean(process.env.BOOTHPRO_OWNER_USER_ID);
   const workspaceId=clean(process.env.BOOTHPRO_WORKSPACE_ID)||'boothpro';
   const boothId=clean(process.env.BOOTHPRO_BOOTH_ID)||'default';
   if(!ownerUserId){return json(res,503,{ok:false,error:'Manifest owner belum dikonfigurasi. Atur BOOTHPRO_OWNER_USER_ID di Vercel menggunakan UUID user pemilik kiosk; tidak perlu mengubah skema Supabase.'});}
   const row={user_id:ownerUserId,workspace_id:workspaceId,booth_id:boothId,session_id:sid,photo_url:publicUrl(photo),gif_url:publicUrl(gif),video_url:publicUrl(video),media_status:'uploaded',updated_at:new Date().toISOString()};
   // Manifest is written once using the real owner identity required by the existing schema.
   // Existing rows are updated; new rows use the configured kiosk owner. No schema relaxation is performed.
   let manifestWarning=null;
   try{
    const find=await fetch(base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,user_id,workspace_id,booth_id,photo_url,gif_url,video_url&limit=1',{headers:h,cache:'no-store'});const found=await find.json().catch(()=>null);
    if(!find.ok)throw new Error(found?.message||found?.hint||('Manifest lookup HTTP '+find.status));
    const exists=Array.isArray(found)&&found[0];
    const url=exists?base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid):base+'/rest/v1/boothpro_session_manifest';
    const body=exists?{workspace_id:workspaceId,booth_id:boothId,photo_url:row.photo_url,gif_url:row.gif_url,video_url:row.video_url,media_status:'uploaded',updated_at:row.updated_at}:{...row};
    const up=await fetch(url,{method:exists?'PATCH':'POST',headers:{...h,Prefer:'return=representation'},body:JSON.stringify(body),cache:'no-store'});
    const data=await up.json().catch(()=>null);
    if(!up.ok){
      const detail=data?.message||data?.hint||('Manifest HTTP '+up.status);
      const retry=await fetch(base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,user_id,workspace_id,booth_id,photo_url,gif_url,video_url&limit=1',{headers:h,cache:'no-store'});const retryData=await retry.json().catch(()=>null);
      const existing=retry.ok&&Array.isArray(retryData)?retryData[0]:null;
      const alreadyMatches=Boolean(existing&&existing.photo_url===row.photo_url&&existing.gif_url===row.gif_url&&existing.video_url===row.video_url);
      if(alreadyMatches){manifestWarning=null;}else{manifestWarning=detail;}
    }
   }catch(e){manifestWarning=e?.message||String(e)}
   return json(res,200,{ok:true,sessionId:sid,mediaStatus:'uploaded',manifestReady:!manifestWarning,manifestWarning});
  }
  return json(res,400,{ok:false,error:'Action upload tidak valid.'});
 }catch(e){return json(res,502,{ok:false,error:e instanceof Error?e.message:'Upload soft file gagal.'});}
}
async function getSessionMedia(sid){const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error('Soft file storage belum dikonfigurasi.');const h={apikey:key,Authorization:'Bearer '+key,Accept:'application/json'};const url=SUPA+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&select=session_id,package_name,photo_url,gif_url,video_url,media_status,expires_at,updated_at&order=updated_at.desc&limit=1';const r=await fetch(url,{headers:h,cache:'no-store'});const d=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(d)||!d[0])return null;const row=d[0],photo_url=String(row.photo_url||'').trim()||null,gif_url=String(row.gif_url||'').trim()||null,video_url=String(row.video_url||'').trim()||null;return {session_id:row.session_id,package_name:row.package_name||'BoothPro',photo_url,gif_url,video_url,media_status:photo_url&&gif_url&&video_url?'uploaded':'partial',expires_at:row.expires_at||null,updated_at:row.updated_at||null};}

const paymentProduction = () => clean(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === 'true';
const paymentApiBase = () => paymentProduction() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const paymentServerKey = () => { const key = clean(process.env.MIDTRANS_SERVER_KEY); if (!key) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi di Vercel.'); return key; };
const paymentSafeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && require('node:crypto').timingSafeEqual(x, y); };
async function paymentLoadPricing() {
 const r=await fetch(configBase()+'/rest/v1/boothpro_operator_config?id=eq.1&select=config&limit=1',{headers:configHeaders(),cache:'no-store'});
 const data=await r.json().catch(()=>null);
 if(!r.ok||!Array.isArray(data)||!data[0]?.config)throw new Error('Konfigurasi harga BoothPro belum tersedia di cloud.');
 const config=data[0].config;
 return {config,packages:Array.isArray(config.packages)?config.packages:[],extraPrintPrice:Number(config.extraPrintPrice??10000)};
}
async function paymentCreate(req,res) {
 const crypto = await import('node:crypto');
 const packageId=clean(req.body?.packageId),voucherCode=clean(req.body?.voucherCode).toUpperCase(),extraPrints=Number(req.body?.extraPrints??0);
 if(!['mini','strip','dual_strip'].includes(packageId)||!Number.isInteger(extraPrints)||extraPrints<0||extraPrints>20)return json(res,400,{ok:false,error:'Paket atau jumlah cetak tambahan tidak valid.'});
 const pricing=await paymentLoadPricing(),pkg=pricing.packages.find(p=>p.id===packageId);
 if(!pkg||!Number.isSafeInteger(Number(pkg.price))||Number(pkg.price)<0)return json(res,400,{ok:false,error:'Harga paket tidak valid pada konfigurasi Dashboard.'});
 const subtotal=Math.round(Number(pkg.price)+extraPrints*Number(pricing.extraPrintPrice));
 const voucher=voucherCode?(Array.isArray(pricing.config?.voucherCodes)?pricing.config.voucherCodes.find(v=>clean(v.code).toUpperCase()===voucherCode):null):null;
 if(voucherCode&&!voucher)return json(res,400,{ok:false,error:'Kode voucher tidak valid pada konfigurasi server.'});
 const discountPercent=voucher?Math.max(0,Math.min(100,Number(voucher.discountPercent)||0)):0;
 const amount=Math.round(Math.max(0,subtotal-Math.round(subtotal*discountPercent/100)));
 if(!Number.isSafeInteger(amount)||amount<1000||amount>10000000)return json(res,400,{ok:false,error:'Nominal transaksi di luar batas yang diizinkan.'});
 const orderId='BP-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(8).toString('hex').toUpperCase();
 const payload={payment_type:'qris',transaction_details:{order_id:orderId,gross_amount:amount},item_details:[{id:packageId,price:amount,quantity:1,name:'BoothPro - '+clean(pkg.name).slice(0,40)}],qris:{acquirer:'gopay'}};
 const r=await fetch(paymentApiBase()+'/v2/charge',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(paymentServerKey()+':').toString('base64'),Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
 const data=await r.json().catch(()=>null);
 if(!r.ok)return json(res,502,{ok:false,error:data?.status_message||'Midtrans gagal membuat QRIS. Periksa aktivasi QRIS pada akun merchant.'});
 const action=Array.isArray(data?.actions)?data.actions.find(a=>a.name==='generate-qr-code'):null,qrUrl=clean(action?.url||data?.qr_code_url);
 if(!qrUrl)return json(res,502,{ok:false,error:'Midtrans tidak mengembalikan URL QRIS. Periksa konfigurasi metode QRIS merchant.'});
 return json(res,200,{ok:true,orderId,amount,qrUrl,expiry:data?.expiry_time||null,environment:paymentProduction()?'production':'sandbox'});
}
async function paymentStatus(req,res) {
 const orderId=clean(req.query?.orderId);
 if(!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId))return json(res,400,{ok:false,error:'ID transaksi tidak valid.'});
 const url=configBase()+'/rest/v1/boothpro_payment_transactions?order_id=eq.'+encodeURIComponent(orderId)+'&select=order_id,gross_amount,transaction_status,payment_type,fraud_status,updated_at&limit=1';
 const r=await fetch(url,{headers:configHeaders(),cache:'no-store'}),rows=await r.json().catch(()=>null);
 if(!r.ok)return json(res,502,{ok:false,error:'Tidak dapat membaca status notifikasi pembayaran. Pastikan tabel boothpro_payment_transactions sudah dibuat.'});
 const row=Array.isArray(rows)?rows[0]:null;
 if(!row)return json(res,200,{ok:true,paid:false,status:'pending'});
 const status=clean(row.transaction_status),paid=status==='settlement'||(status==='capture'&&clean(row.fraud_status)==='accept');
 return json(res,200,{ok:true,paid,status,amount:Number(row.gross_amount),orderId:clean(row.order_id),paymentType:clean(row.payment_type),updatedAt:row.updated_at||null});
}
async function paymentNotification(req,res) {
 const key=clean(process.env.MIDTRANS_SERVER_KEY);
 if(!key)return json(res,503,{ok:false,error:'MIDTRANS_SERVER_KEY belum dikonfigurasi.'});
 const b=req.body||{},orderId=clean(b.order_id),statusCode=clean(b.status_code),grossAmount=clean(b.gross_amount),signature=clean(b.signature_key);
 if(!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId)||!statusCode||!grossAmount||!signature)return json(res,400,{ok:false,error:'Payload notifikasi Midtrans tidak lengkap atau ID tidak valid.'});
 const crypto=await import('node:crypto');
 const expected=crypto.createHash('sha512').update(orderId+statusCode+grossAmount+key).digest('hex');
 if(!paymentSafeEqual(signature.toLowerCase(),expected.toLowerCase()))return json(res,401,{ok:false,error:'Signature notifikasi Midtrans tidak valid.'});
 const row={order_id:orderId,gross_amount:Number(grossAmount),transaction_status:clean(b.transaction_status),payment_type:clean(b.payment_type)||null,fraud_status:clean(b.fraud_status)||null,status_code:statusCode,updated_at:new Date().toISOString()};
 if(!Number.isFinite(row.gross_amount)||row.gross_amount<0)return json(res,400,{ok:false,error:'Nominal transaksi notifikasi tidak valid.'});
 const url=configBase()+'/rest/v1/boothpro_payment_transactions?on_conflict=order_id';
 const saved=await fetch(url,{method:'POST',headers:{...configHeaders(),Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row),cache:'no-store'});
 const result=await saved.json().catch(()=>null);
 if(!saved.ok)return json(res,502,{ok:false,error:result?.message||result?.hint||'Notifikasi terverifikasi tetapi gagal disimpan ke Supabase. Pastikan tabel pembayaran sudah dibuat.'});
 return json(res,200,{ok:true,received:true,orderId,status:row.transaction_status});
}

export default async function handler(req,res){try{if(req.query?.route==='payment-create'&&req.method==='POST')return await paymentCreate(req,res);if(req.query?.route==='payment-status'&&req.method==='GET')return await paymentStatus(req,res);if(req.query?.route==='payment-notification'&&req.method==='POST')return await paymentNotification(req,res);if(req.query?.route==='config')return await handleConfig(req,res);if(req.query?.route==='softfile-upload')return await handleSoftfileUpload(req,res);const sid=String(req.query?.session||req.body?.sessionId||'').trim();if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});if(req.method==='GET'){const row=await getSessionMedia(sid);if(!row)return json(res,404,{ok:false,error:'Soft file tidak ditemukan. Pastikan sinkronisasi sudah selesai.'});if(row.expires_at&&Date.now()>Date.parse(row.expires_at))return json(res,410,{ok:false,error:'Soft file sudah kedaluwarsa.'});return json(res,200,{ok:true,session:row});}if(req.method==='POST')return json(res,200,{ok:true,shareUrl:origin(req)+'/share.html?session='+encodeURIComponent(sid)});return json(res,405,{ok:false,error:'Method tidak didukung.'});}catch(e){return json(res,500,{ok:false,error:e.message||String(e)});}};
