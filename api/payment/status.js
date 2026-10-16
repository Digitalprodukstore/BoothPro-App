const clean = (v) => String(v ?? '').trim();
const json = (res, status, body) => res.status(status).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
const production = () => clean(process.env.MIDTRANS_IS_PRODUCTION).toLowerCase() === 'true';
const apiBase = () => production() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const serverKey = () => { const key = clean(process.env.MIDTRANS_SERVER_KEY); if (!key) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi di Vercel.'); return key; };
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method tidak didukung.' });
  const orderId = clean(req.query?.orderId);
  if (!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId)) return json(res, 400, { ok: false, error: 'ID transaksi tidak valid.' });
  try {
    const auth = 'Basic ' + Buffer.from(serverKey() + ':').toString('base64');
    const r = await fetch(apiBase() + '/v2/' + encodeURIComponent(orderId) + '/status', { headers: { Authorization: auth, Accept: 'application/json' }, cache: 'no-store' });
    const data = await r.json().catch(() => null);
    if (r.status === 404 || data?.status_code === '404') return json(res, 200, { ok: true, paid: false, status: 'pending' });
    if (!r.ok) return json(res, 502, { ok: false, error: 'Tidak dapat memeriksa status pembayaran ke Midtrans.' });
    const paid = data?.transaction_status === 'settlement' || (data?.transaction_status === 'capture' && data?.fraud_status === 'accept');
    return json(res, 200, { ok: true, paid, status: clean(data?.transaction_status) || 'pending', amount: Number(data?.gross_amount), orderId: clean(data?.order_id), paymentType: clean(data?.payment_type) });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Pemeriksaan pembayaran gagal.' });
  }
}
