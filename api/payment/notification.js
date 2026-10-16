import crypto from 'node:crypto';

const clean = (v) => String(v ?? '').trim();
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const supabaseBase = () => clean(process.env.SUPABASE_URL || 'https://jnajtcuxlgkpplyvvsik.supabase.co').replace(/\\/+$/, '');
function supabaseHeaders() {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  return { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json', 'Content-Type': 'application/json' };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method tidak didukung.' });
  try {
    const key = clean(process.env.MIDTRANS_SERVER_KEY);
    if (!key) return json(res, 503, { ok: false, error: 'MIDTRANS_SERVER_KEY belum dikonfigurasi.' });
    const b = req.body || {};
    const orderId = clean(b.order_id), statusCode = clean(b.status_code), grossAmount = clean(b.gross_amount), signature = clean(b.signature_key);
    if (!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId) || !statusCode || !grossAmount || !signature) return json(res, 400, { ok: false, error: 'Payload notifikasi Midtrans tidak lengkap atau ID tidak valid.' });
    const expected = crypto.createHash('sha512').update(orderId + statusCode + grossAmount + key).digest('hex');
    if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) return json(res, 401, { ok: false, error: 'Signature notifikasi Midtrans tidak valid.' });
    const row = {
      order_id: orderId,
      gross_amount: Number(grossAmount),
      transaction_status: clean(b.transaction_status),
      payment_type: clean(b.payment_type) || null,
      fraud_status: clean(b.fraud_status) || null,
      status_code: statusCode,
      updated_at: new Date().toISOString()
    };
    if (!Number.isFinite(row.gross_amount) || row.gross_amount < 0) return json(res, 400, { ok: false, error: 'Nominal transaksi notifikasi tidak valid.' });
    const url = supabaseBase() + '/rest/v1/boothpro_payment_transactions?on_conflict=order_id';
    const saved = await fetch(url, { method: 'POST', headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row), cache: 'no-store' });
    const result = await saved.json().catch(() => null);
    if (!saved.ok) return json(res, 502, { ok: false, error: result?.message || result?.hint || 'Notifikasi terverifikasi tetapi gagal disimpan ke Supabase. Pastikan tabel pembayaran sudah dibuat.' });
    return json(res, 200, { ok: true, received: true, orderId, status: row.transaction_status });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Notifikasi pembayaran gagal diproses.' });
  }
}
