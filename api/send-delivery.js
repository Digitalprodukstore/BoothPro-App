const clean=(v)=>String(v??'').trim();
const json=(res,status,body)=>res.status(status).setHeader('Content-Type','application/json').send(JSON.stringify(body));

function env(name){
  const v=clean(process.env[name]);
  if(!v) throw new Error(name+' belum dikonfigurasi di Vercel.');
  return v;
}
function supabaseHeaders(){
  const key=env('SUPABASE_SERVICE_ROLE_KEY');
  return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
}
function normalizePhone(v){
  let p=clean(v).replace(/\D/g,'');
  if(p.startsWith('0')) p='62'+p.slice(1);
  if(p.startsWith('8')) p='62'+p;
  return p;
}
async function upsertSession(input){
  const base=env('SUPABASE_URL').replace(/\/$/,'');
  const row={session_id:input.sessionId,customer_name:input.name,whatsapp:input.method==='whatsapp'?normalizePhone(input.target):null,email:input.method==='email'?input.target:null,delivery_method:input.method,delivery_status:'pending',photo_path:input.photoPath||null,gif_path:input.gifPath||null,video_path:input.videoPath||null};
  const u=base+'/rest/v1/sessions?on_conflict=session_id';
  const r=await fetch(u,{method:'POST',headers:{...supabaseHeaders(),Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(d?.message||d?.hint||'Gagal menyimpan sesi Supabase.');
  return Array.isArray(d)?d[0]:d;
}
async function getSession(sessionId){
  const base=env('SUPABASE_URL').replace(/\/$/,'');
  const u=base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sessionId)+'&select=*&limit=1';
  const r=await fetch(u,{headers:supabaseHeaders(),cache:'no-store'});
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(d?.message||'Gagal membaca sesi Supabase.');
  if(!Array.isArray(d)||!d[0]) throw new Error('Sesi tidak ditemukan.');
  return d[0];
}
async function updateSession(sessionId,patch){
  const base=env('SUPABASE_URL').replace(/\/$/,'');
  const u=base+'/rest/v1/sessions?session_id=eq.'+encodeURIComponent(sessionId);
  const r=await fetch(u,{method:'PATCH',headers:{...supabaseHeaders(),Prefer:'return=minimal'},body:JSON.stringify(patch)});
  if(!r.ok){const d=await r.json().catch(()=>null);throw new Error(d?.message||'Gagal memperbarui status sesi.');}
}
async function sendFonnte(target,name,url){
  const token=env('FONNTE_TOKEN');
  const body=new URLSearchParams({
    target,message:'Halo '+name+', soft file BOOTHPRO Anda sudah siap.\\n\\n📸 Foto Final\\n🎞️ GIF Loop\\n🎥 Live Session Video\\n\\nBuka dan simpan di:\\n'+url
  });
  const r=await fetch('https://api.fonnte.com/send',{method:'POST',headers:{Authorization:token},body});
  const d=await r.json().catch(()=>null);
  if(!r.ok || d?.status===false) throw new Error(d?.reason||d?.message||'Fonnte gagal mengirim WhatsApp.');
  return d;
}
async function sendResend(target,name,url){
  const key=env('RESEND_API_KEY');
  const from=env('RESEND_FROM_EMAIL');
  const html='<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>BOOTHPRO</h2><p>Halo '+name+', soft file Anda sudah siap.</p><p>Foto Final, GIF Loop, dan Live Session Video tersedia di satu halaman unduhan.</p><p><a href="'+url+'">Buka & Simpan Soft File</a></p></div>';
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from:'BOOTHPRO <'+from+'>',to:[target],subject:'BOOTHPRO · Soft File Anda',html})});
  const d=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(d?.message||'Resend gagal mengirim email.');
  return d;
}

module.exports=async function(req,res){
  if(req.method!=='POST') return json(res,405,{ok:false,error:'Method tidak didukung.'});
  const b=req.body||{};
  const sessionId=clean(b.sessionId), name=clean(b.customerName)||'Pelanggan';
  const method=clean(b.deliveryMethod).toLowerCase(), target=clean(b.target);
  if(!sessionId) return json(res,400,{ok:false,error:'sessionId wajib.'});
  if(!['whatsapp','email'].includes(method)) return json(res,400,{ok:false,error:'deliveryMethod harus whatsapp atau email.'});
  if(!target) return json(res,400,{ok:false,error:'target wajib.'});
  try{
    let session=await getSession(sessionId).catch(()=>null);
    if(!session){
      session=await upsertSession({sessionId,name,method,target,photoPath:b.photoPath,gifPath:b.gifPath,videoPath:b.videoPath});
    }else if(b.photoPath||b.gifPath||b.videoPath){
      await updateSession(sessionId,{customer_name:name,photo_path:b.photoPath||session.photo_path,gif_path:b.gifPath||session.gif_path,video_path:b.videoPath||session.video_path});
      session=await getSession(sessionId);
    }
    if(!session.photo_path||!session.gif_path||!session.video_path) throw new Error('3 soft file belum lengkap.');
    const origin=clean(process.env.BOOTHPRO_PUBLIC_ORIGIN)||'https://boothpro.my.id';
    const url=origin.replace(/\/$/,'')+'/download/'+encodeURIComponent(sessionId);
    await updateSession(sessionId,{customer_name:name,delivery_method:method,whatsapp:method==='whatsapp'?normalizePhone(target):session.whatsapp,email:method==='email'?target:session.email,delivery_status:'sending'});
    if(method==='whatsapp'){
      const phone=normalizePhone(target);
      if(!/^62\d{8,15}$/.test(phone)) throw new Error('Nomor WhatsApp tidak valid. Gunakan format 08... atau 628...');
      await sendFonnte(phone,name,url);
    }else{
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new Error('Email tidak valid.');
      await sendResend(target,name,url);
    }
    await updateSession(sessionId,{delivery_status:'sent',sent_at:new Date().toISOString()});
    return json(res,200,{ok:true,sessionId,bundleUrl:url});
  }catch(e){
    try{await updateSession(sessionId,{delivery_status:'failed'})}catch(_){}
    return json(res,500,{ok:false,error:e?.message||String(e)});
  }
};
