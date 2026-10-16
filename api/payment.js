import crypto from 'node:crypto';

const clean = (v) => String(v ?? '').trim();
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
const production = () => clean(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === 'true';
const apiBase = () => production() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const serverKey = () => { const key = clean(process.env.MIDTRANS_SERVER_KEY); if (!key) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi di Vercel.'); return key; };
const supabaseBase = () => clean(process.env.SUPABASE_URL || 'https://jnajtcuxlgkpplyvvsik.supabase.co').replace(/\\/+$/, '');
const supabaseHeaders = (jsonBody = false) => {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  return { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json', ...(jsonBody ? { 'Content-Type': 'application/json' } : {}) };
};
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function loadPricing() {
  const r = await fetch(supabaseBase() + '/rest/v1/boothpro_operator_config?id=eq.1&select=config&limit=1', { headers: supabaseHeaders(), cache: 'no-store' });
  const data = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(data) || !data[0]?.config) throw new Error('Konfigurasi harga BoothPro belum tersedia di cloud.');
  const config = data[0].config;
  return { config, packages: Array.isArray(config.packages) ? config.packages : [], extraPrintPrice: Number(config.extraPrintPrice ?? 10000) };
}

async function createPayment(req, res) {
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
  const payload = { payment_type: 'qris', transaction_details: { order_id: orderId, gross_amount: amount }, item_details: [{ id: packageId, price: amount, quantity: 1, name: 'BoothPro - ' + clean(pkg.name).slice(0, 40) }], qris: { acquirer: 'gopay' } };
  const r = await fetch(apiBase() + '/v2/charge', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(serverKey() + ':').toString('base64'), Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
  const data = await r.json().catch(() => null);
  if (!r.ok) return json(res, 502, { ok: false, error: data?.status_message || 'Midtrans gagal membuat QRIS. Periksa aktivasi QRIS pada akun merchant.' });
  const qrAction = Array.isArray(data?.actions) ? data.actions.find((a) => a.name === 'generate-qr-code') : null;
  const qrUrl = clean(qrAction?.url || data?.qr_code_url);
  if (!qrUrl) return json(res, 502, { ok: false, error: 'Midtrans tidak mengembalikan URL QRIS. Periksa konfigurasi metode QRIS merchant.' });
  return json(res, 200, { ok: true, orderId, amount, qrUrl, expiry: data?.expiry_time || null, environment: production() ? 'production' : 'sandbox' });
}

async function paymentStatus(req, res) {
  const orderId = clean(req.query?.orderId);
  if (!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId)) return json(res, 400, { ok: false, error: 'ID transaksi tidak valid.' });
  const url = supabaseBase() + '/rest/v1/boothpro_payment_transactions?order_id=eq.' + encodeURIComponent(orderId) + '&select=order_id,gross_amount,transaction_status,payment_type,fraud_status,updated_at&limit=1';
  const r = await fetch(url, { headers: supabaseHeaders(), cache: 'no-store' });
  const rows = await r.json().catch(() => null);
  if (!r.ok) return json(res, 502, { ok: false, error: 'Tidak dapat membaca status notifikasi pembayaran. Pastikan tabel boothpro_payment_transactions sudah dibuat.' });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return json(res, 200, { ok: true, paid: false, status: 'pending' });
  const status = clean(row.transaction_status);
  const paid = status === 'settlement' || (status === 'capture' && clean(row.fraud_status) === 'accept');
  return json(res, 200, { ok: true, paid, status, amount: Number(row.gross_amount), orderId: clean(row.order_id), paymentType: clean(row.payment_type), updatedAt: row.updated_at || null });
}

async function paymentNotification(req, res) {
  const key = clean(process.env.MIDTRANS_SERVER_KEY);
  if (!key) return json(res, 503, { ok: false, error: 'MIDTRANS_SERVER_KEY belum dikonfigurasi.' });
  const b = req.body || {};
  const orderId = clean(b.order_id), statusCode = clean(b.status_code), grossAmount = clean(b.gross_amount), signature = clean(b.signature_key);
  if (!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId) || !statusCode || !grossAmount || !signature) return json(res, 400, { ok: false, error: 'Payload notifikasi Midtrans tidak lengkap atau ID tidak valid.' });
  const expected = crypto.createHash('sha512').update(orderId + statusCode + grossAmount + key).digest('hex');
  if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) return json(res, 401, { ok: false, error: 'Signature notifikasi Midtrans tidak valid.' });
  const row = { order_id: orderId, gross_amount: Number(grossAmount), transaction_status: clean(b.transaction_status), payment_type: clean(b.payment_type) || null, fraud_status: clean(b.fraud_status) || null, status_code: statusCode, updated_at: new Date().toISOString() };
  if (!Number.isFinite(row.gross_amount) || row.gross_amount < 0) return json(res, 400, { ok: false, error: 'Nominal transaksi notifikasi tidak valid.' });
  const url = supabaseBase() + '/rest/v1/boothpro_payment_transactions?on_conflict=order_id';
  const saved = await fetch(url, { method: 'POST', headers: { ...supabaseHeaders(true), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row), cache: 'no-store' });
  const result = await saved.json().catch(() => null);
  if (!saved.ok) return json(res, 502, { ok: false, error: result?.message || result?.hint || 'Notifikasi terverifikasi tetapi gagal disimpan ke Supabase. Pastikan tabel pembayaran sudah dibuat.' });
  return json(res, 200, { ok: true, received: true, orderId, status: row.transaction_status });
}

export default async function handler(req, res) {
  try {
    const route = clean(req.query?.route);
    if (route === 'create' && req.method === 'POST') return await createPayment(req, res);
    if (route === 'status' && req.method === 'GET') return await paymentStatus(req, res);
    if (route === 'notification' && req.method === 'POST') return await paymentNotification(req, res);
    return json(res, 405, { ok: false, error: 'Method atau rute pembayaran tidak didukung.' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Kesalahan layanan pembayaran.' });
  }
}
