import crypto from 'node:crypto';

const clean = (v) => String(v ?? '').trim();
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method tidak didukung.' });
  try {
    const key = clean(process.env.MIDTRANS_SERVER_KEY);
    if (!key) return json(res, 503, { ok: false, error: 'MIDTRANS_SERVER_KEY belum dikonfigurasi.' });
    const b = req.body || {};
    const orderId = clean(b.order_id), statusCode = clean(b.status_code), grossAmount = clean(b.gross_amount), signature = clean(b.signature_key);
    if (!orderId || !statusCode || !grossAmount || !signature) return json(res, 400, { ok: false, error: 'Payload notifikasi Midtrans tidak lengkap.' });
    const expected = crypto.createHash('sha512').update(orderId + statusCode + grossAmount + key).digest('hex');
    if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) return json(res, 401, { ok: false, error: 'Signature notifikasi Midtrans tidak valid.' });
    // A verified notification is acknowledged. The kiosk still checks the authenticated
    // Midtrans Status API before advancing, so a forged browser event cannot unlock capture.
    return json(res, 200, { ok: true, received: true, orderId, status: clean(b.transaction_status) });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Notifikasi pembayaran gagal diproses.' });
  }
}
