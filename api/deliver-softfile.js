/**
 * BoothPro Soft File Bundle Delivery
 * Sends one notification containing a single bundle URL.
 * The bundle page contains:
 * 1) Final photo (exact print result)
 * 2) GIF
 * 3) Live session video
 *
 * Server-side variables:
 * WHATSAPP_ACCESS_TOKEN
 * WHATSAPP_PHONE_NUMBER_ID
 * WHATSAPP_GRAPH_VERSION (optional)
 * RESEND_API_KEY
 * RESEND_FROM_EMAIL
 * SUPABASE_URL
 * SUPABASE_PUBLISHABLE_KEY
 */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));
const clean=v=>String(v||'').trim();
const phone=v=>clean(v).replace(/\D/g,'');
const required=name=>{const v=clean(process.env[name]);if(!v)throw new Error(name+' belum dikonfigurasi di server.');return v};

async function getManifest(sid){
 const base=required('SUPABASE_URL').replace(/\/$/,'');
 const key=required('SUPABASE_PUBLISHABLE_KEY');
 const url=base+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&media_status=neq.deleted&select=session_id,photo_url,gif_url,video_url,expires_at,media_status&limit=1';
 const r=await fetch(url,{headers:{apikey:key,Accept:'application/json'},cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||d?.hint||'Manifest soft file tidak dapat dibaca.');
 const row=Array.isArray(d)?d[0]:null;
 if(!row)throw new Error('Session soft file tidak ditemukan.');
 if(row.expires_at&&Date.now()>Date.parse(row.expires_at))throw new Error('Soft file sudah kedaluwarsa.');
 return row;
}
function ensureUrl(v,name){const u=clean(v);if(!u||!/^https?:\/\//i.test(u))throw new Error(name+' belum tersedia atau URL tidak valid.');return u}

async function sendWhatsApp(to,message,bundleUrl){
 const token=required('WHATSAPP_ACCESS_TOKEN');
 const id=required('WHATSAPP_PHONE_NUMBER_ID');
 const version=clean(process.env.WHATSAPP_GRAPH_VERSION)||'v23.0';
 const endpoint='https://graph.facebook.com/'+version+'/'+encodeURIComponent(id)+'/messages';
 const bodyText=(message||'Soft file BoothPro Anda sudah siap.')+'\n\nBOOTHPRO\nBuka link ini untuk menyimpan 3 soft file sekaligus:\n'+bundleUrl;
 const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({
  messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:true,body:bodyText}
 })});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.error?.message||'WhatsApp API gagal mengirim notifikasi.');
 return d;
}
async function sendEmail(to,message,bundleUrl,sid){
 const key=required('RESEND_API_KEY');
 const from=required('RESEND_FROM_EMAIL');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
  from,to:[to],subject:'BOOTHPRO · Soft File '+sid,
  html:'<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>BOOTHPRO</h2><p>Soft file sesi foto Anda sudah siap.</p><p>Link ini berisi <b>1 Foto Final + 1 GIF + 1 Live Video Session</b>.</p><p><a href="'+bundleUrl+'" style="display:inline-block;padding:12px 18px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px">Buka & Simpan Soft File</a></p><p>'+bundleUrl+'</p></div>',
  text:(message||'Soft file BoothPro Anda sudah siap.')+'\n\nBOOTHPRO\nBuka link berikut untuk menyimpan 1 Foto Final + 1 GIF + 1 Live Video Session:\n'+bundleUrl
 })});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||'Resend gagal mengirim email.');
 return d;
}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'Method tidak didukung.'});
 try{
  const body=req.body||{};
  const channel=clean(body.channel).toLowerCase();
  const sid=clean(body.sessionId);
  if(!sid)return json(res,400,{ok:false,error:'Session ID wajib diisi.'});
  if(channel!=='whatsapp'&&channel!=='email')return json(res,400,{ok:false,error:'Channel harus whatsapp atau email.'});
  const row=await getManifest(sid);
  ensureUrl(row.photo_url,'Foto final');
  if(!clean(row.gif_url)||!clean(row.video_url))return json(res,409,{ok:false,error:'Bundle belum lengkap. Foto, GIF, dan Live Video harus tersedia sebelum dikirim.'});
  const origin=clean(req.headers['x-forwarded-proto']||'https')+'://'+clean(req.headers['x-forwarded-host']||req.headers.host);
  const bundleUrl=origin+'/api/softfile?sessionId='+encodeURIComponent(sid);
  const message=clean(body.message);
  if(channel==='whatsapp'){
   const to=phone(body.phone);
   if(!/^62\d{8,15}$/.test(to))return json(res,400,{ok:false,error:'Nomor WhatsApp harus format Indonesia 62xxxxxxxxxx.'});
   await sendWhatsApp(to,message,bundleUrl);
   return json(res,200,{ok:true,channel:'whatsapp',sent:1,bundleUrl});
  }
  const email=clean(body.email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{ok:false,error:'Alamat email tidak valid.'});
  const result=await sendEmail(email,message,bundleUrl,sid);
  return json(res,200,{ok:true,channel:'email',id:result?.id||null,bundleUrl});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};
