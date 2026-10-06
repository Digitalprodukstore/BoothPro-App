module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  const checks={
    supabaseUrl:Boolean(String(process.env.SUPABASE_URL||'').trim()),
    supabaseServiceRoleKey:Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim()),
    fonnteToken:Boolean(String(process.env.FONNTE_TOKEN||'').trim()),
    brevoApiKey:Boolean(String(process.env.BREVO_API_KEY||'').trim()),
    brevoFromEmail:Boolean(String(process.env.BREVO_FROM_EMAIL||'').trim())
  };
  const storageReady=checks.supabaseUrl&&checks.supabaseServiceRoleKey;
  return res.status(200).json({
    ok:storageReady,
    storageReady,
    delivery:{
      whatsappReady:checks.fonnteToken,
      emailReady:checks.brevoApiKey&&checks.brevoFromEmail
    },
    checks
  });
};
