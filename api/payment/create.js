import crypto from 'node:crypto';

const clean = (v) => String(v ?? '').trim();
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
const production = () => clean(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === 'true';
const apiBase = () => production() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const serverKey = () => { const key = clean(process.env.MIDTRANS_SERVER_KEY); if (!key) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi di Vercel.'); return key; };
const headers = () => ({ Authorization: 'Basic ' + Buffer.from(serverKey() + ':').toString('base64'), Accept: 'application/json', 'Content-Type': 'application/json' });
const supabaseBase = () => clean(process.env.SUPABASE_URL || 'https://jnajtcuxlgkpplyvvsik.supabase.co').replace(/\/+$/, '');
async function loadPricing() {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  const r = await fetch(supabaseBase() + '/rest/v1/boothpro_operator_config?id=eq.1&select=config&limit=1', { headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }, cache: 'no-store' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(data) || !data[0]?.config) throw new Error('Konfigurasi harga BoothPro belum tersedia di cloud.');
  const config = data[0].config;
  return { config, packages: Array.isArray(config.packages) ? config.packages : [], extraPrintPrice: Number(config.extraPrintPrice ?? 10000) };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method tidak didukung.' });
  try {
    const packageId = clean(req.body?.packageId);
    const voucherCode = clean(req.body?.voucherCode).toUpperCase();
    const extraPrints = Number(req.body?.extraPrints ?? 0);
    if (!['mini', 'strip', 'dual_strip'].includes(packageId) || !Number.isInteger(extraPrints) || extraPrints < 0 || extraPrints > 20) return json(res, 400, { ok: false, error: 'Paket atau jumlah cetak tambahan tidak valid.' });
    const pricing = await loadPricing();
    const pkg = pricing.packages.find((p) => p.id === packageId);
    if (!pkg || !Number.isSafeInteger(Number(pkg.price)) || Number(pkg.price) < 0) return json(res, 400, { ok: false, error: 'Harga paket tidak valid pada konfigurasi Dashboard.' });
    const subtotal = Math.round(Number(pkg.price) + extraPrints * Number(pricing.extraPrintPrice));
    const voucher = voucherCode ? (Array.isArray(pricing.config?.voucherCodes) ? pricing.config.voucherCodes.find((v) => clean(v.code).toUpperCase() === voucherCode) : null) : null;
    if (voucherCode && !voucher) return json(res, 400, { ok: false, error: 'Kode voucher tidak valid pada konfigurasi server.' });
    const discountPercent = voucher ? Math.max(0, Math.min(100, Number(voucher.discountPercent) || 0)) : 0;
    const amount = Math.round(Math.max(0, subtotal - Math.round(subtotal * discountPercent / 100)));
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 10000000) return json(res, 400, { ok: false, error: 'Nominal transaksi di luar batas yang diizinkan.' });
    const orderId = 'BP-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const payload = {
      payment_type: 'qris',
      transaction_details: { order_id: orderId, gross_amount: amount },
      item_details: [{ id: packageId, price: amount, quantity: 1, name: 'BoothPro - ' + clean(pkg.name).slice(0, 40) }],
      qris: { acquirer: 'gopay' }
    };
    const r = await fetch(apiBase() + '/v2/charge', { method: 'POST', headers: headers(), body: JSON.stringify(payload), cache: 'no-store' });
    const data = await r.json().catch(() => null);
    if (!r.ok) return json(res, 502, { ok: false, error: data?.status_message || 'Midtrans gagal membuat QRIS. Periksa aktivasi QRIS pada akun merchant.' });
    const qrAction = Array.isArray(data?.actions) ? data.actions.find((a) => a.name === 'generate-qr-code') : null;
    const qrUrl = clean(qrAction?.url || data?.qr_code_url);
    if (!qrUrl) return json(res, 502, { ok: false, error: 'Midtrans tidak mengembalikan URL QRIS. Periksa konfigurasi metode QRIS merchant.' });
    return json(res, 200, { ok: true, orderId, amount, qrUrl, expiry: data?.expiry_time || null, environment: production() ? 'production' : 'sandbox' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Gagal membuat transaksi QRIS.' });
  }
}
