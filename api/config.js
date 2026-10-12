const safeKeys = [
  'brandName','tagline','logoUrl','coverImageUrl','accentColor','welcomeHeadline','welcomeSubheadline',
  'packages','extraPrintPrice','maxRetakes','countdownSeconds','qrisMerchantName','qrisNmid','qrisStaticQrUrl',
  'voucherCodes','printerPaperSize','printerAutoPrint','kioskTimeoutSeconds'
];
const clean = (v) => String(v ?? '').trim();
const json = (res, status, body) => res.status(status).setHeader('Content-Type','application/json').setHeader('Cache-Control','no-store').send(JSON.stringify(body));
const baseUrl = () => clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
const headers = () => {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur di Vercel.');
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
};
function safeConfig(value) {
  const out = {};
  for (const key of safeKeys) if (Object.prototype.hasOwnProperty.call(value || {}, key)) out[key] = value[key];
  return out;
}
async function readConfig() {
  const r = await fetch(baseUrl() + '/rest/v1/boothpro_operator_config?id=eq.1&select=config,updated_at&limit=1', { headers: headers(), cache: 'no-store' });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || 'Gagal membaca konfigurasi cloud (HTTP ' + r.status + ').');
  return Array.isArray(data) && data[0] ? data[0] : null;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','PUT','OPTIONS'].includes(req.method)) return json(res, 405, { success:false, message:'Method tidak didukung.' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (!baseUrl()) return json(res, 503, { success:false, message:'SUPABASE_URL belum diatur pada environment Vercel.' });
    if (req.method === 'GET') {
      const row = await readConfig();
      return json(res, 200, { success:true, configured:Boolean(row), config:row ? safeConfig(row.config) : null, updatedAt:row?.updated_at || null });
    }
    const expected = clean(process.env.BOOTHPRO_ADMIN_PIN);
    const supplied = clean(req.headers['x-boothpro-admin-pin']);
    if (!expected || expected.length < 4) return json(res, 503, { success:false, message:'Atur BOOTHPRO_ADMIN_PIN minimal 4 karakter (disarankan 6 digit/karakter) di Vercel sebelum mengaktifkan simpan cloud.' });
    if (!supplied || supplied !== expected) return json(res, 401, { success:false, message:'Otorisasi Dashboard ditolak. PIN server tidak cocok.' });
    const config = safeConfig(req.body?.config);
    if (!Object.keys(config).length) return json(res, 400, { success:false, message:'Konfigurasi publik kosong atau tidak valid.' });
    const r = await fetch(baseUrl() + '/rest/v1/boothpro_operator_config?on_conflict=id', {
      method:'POST',
      headers:{ ...headers(), Prefer:'resolution=merge-duplicates,return=representation' },
      body:JSON.stringify({ id:1, config, updated_at:new Date().toISOString() })
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return json(res, 502, { success:false, message:data?.message || data?.hint || 'Supabase menolak penyimpanan konfigurasi (HTTP '+r.status+').' });
    return json(res, 200, { success:true, message:'Konfigurasi publik berhasil disimpan ke Supabase.', updatedAt:data?.[0]?.updated_at || null });
  } catch (e) {
    return json(res, 502, { success:false, message:e instanceof Error ? e.message : 'Kesalahan sinkronisasi cloud.' });
  }
}