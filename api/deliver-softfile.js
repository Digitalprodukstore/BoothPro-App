/**
 * BoothPro Direct Soft File Delivery
 * WhatsApp: Meta WhatsApp Business Cloud API media messages.
 * Email: Resend API with real file attachments.
 *
 * Required server-side environment variables:
 * WHATSAPP_ACCESS_TOKEN
 * WHATSAPP_PHONE_NUMBER_ID
 * WHATSAPP_GRAPH_VERSION (optional, defaults to v23.0)
 * RESEND_API_KEY
 * RESEND_FROM_EMAIL
 * SUPABASE_URL
 * SUPABASE_PUBLISHABLE_KEY
 *
 * No provider secret is exposed to the kiosk/browser.
 */
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));
const clean=v=>String(v||'').trim();
const phone=v=>clean(v).replace(/\D/g,'');
const required=(name)=>{const v=clean(process.env[name]);if(!v)throw new Error(name+' belum dikonfigurasi di server.');return v};

async function getManifest(sid){
 const base=clean(process.env.SUPABASE_URL)||'https://jnajtcuxlgkpplyvvsik.supabase.co';
 const key=clean(process.env.SUPABASE_PUBLISHABLE_KEY)||'sb_publishable_WGOpLbsm_3Prr2pabYuMw_juhU0mN-';
 const url=base.replace(/\/$/,'')+'/rest/v1/boothpro_session_manifest?session_id=eq.'+encodeURIComponent(sid)+'&media_status=neq.deleted&select=session_id,photo_url,gif_url,video_url,expires_at,media_status&limit=1';
 const r=await fetch(url,{headers:{apikey:key,Accept:'application/json'},cache:'no-store'});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw new Error(d?.message||d?.hint||'Manifest soft file tidak dapat dibaca.');
 const row=Array.isArray(d)?d[0]:null;
 if(!row)throw new Error('Session soft file tidak ditemukan.');
 if(row.expires_at&&Date.now()>Date.parse(row.expires_at))throw new Error('Soft file sudah kedaluwarsa.');
 return row;
}
function ensureUrl(v,name){const u=clean(v);if(!u||!/^https?:\\/\\//i.test(u))throw new Error(name+' belum tersedia atau URL tidak valid.');return u}

async function sendWhatsApp(to,message,media){
 const token=required('WHATSAPP_ACCESS_TOKEN');
 const id=required('WHATSAPP_PHONE_NUMBER_ID');
 const version=clean(process.env.WHATSAPP_GRAPH_VERSION)||'v23.0';
 const endpoint='https://graph.facebook.com/'+version+'/'+encodeURIComponent(id)+'/messages';
 const common={messaging_product:'whatsapp',recipient_type:'individual',to};
 const sent=[];
 const send=async(body)=>{const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...common,...body})});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error?.message||'WhatsApp API gagal mengirim media.');sent.push(d);return d};
 await send({type:'image',image:{link:media.photoUrl,caption:'Foto final BoothPro'}});
 if(media.videoUrl)await send({type:'video',video:{link:media.videoUrl,caption:'Live Video BoothPro'}});
 if(media.gifUrl)await send({type:'document',document:{link:media.gifUrl,filename:'BoothPro-GIF.gif',caption:'GIF BoothPro'}});
 if(message)await send({type:'text',text:{body:message}});
 return sent;
}

async function sendEmail(to,message,media,sid){
 const key=required('RESEND_API_KEY');
 const from=required('RESEND_FROM_EMAIL');
 const attachments=[
  {path:media.photoUrl,filename:'BoothPro-Final.jpg'},
 ];
 if(media.gifUrl)attachments.push({path:media.gifUrl,filename:'BoothPro-GIF.gif'});
 if(media.videoUrl)attachments.push({path:media.videoUrl,filename:'BoothPro-Live-Video.mp4'});
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
  from,to:[to],subject:'Soft File BoothPro '+sid,
  html:'<p>Soft file BoothPro Anda sudah siap.</p><p>Foto final, GIF, dan live video dilampirkan langsung pada email ini.</p>',
  text:message||'Soft file BoothPro Anda sudah siap.',
  attachments
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
  const media={
   photoUrl:ensureUrl(body.photoUrl||row.photo_url,'Foto final'),
   gifUrl:clean(body.gifUrl||row.gif_url),
   videoUrl:clean(body.videoUrl||row.video_url)
  };
  const message=clean(body.message);
  if(channel==='whatsapp'){
   const to=phone(body.phone);
   if(!/^62\\d{8,15}$/.test(to))return json(res,400,{ok:false,error:'Nomor WhatsApp harus format Indonesia 62xxxxxxxxxx.'});
   const result=await sendWhatsApp(to,message,media);
   return json(res,200,{ok:true,channel:'whatsapp',sent:result.length});
  }
  const email=clean(body.email);
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return json(res,400,{ok:false,error:'Alamat email tidak valid.'});
  const result=await sendEmail(email,message,media,sid);
  return json(res,200,{ok:true,channel:'email',id:result?.id||null});
 }catch(e){return json(res,500,{ok:false,error:e.message||String(e)})}
};
