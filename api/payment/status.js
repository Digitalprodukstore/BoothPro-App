const clean = (v) => String(v ?? '').trim();
const json = (res, code, body) => res.status(code).setHeader('Content-Type', 'application/json').setHeader('Cache-Control', 'no-store').send(JSON.stringify(body));
const supabaseBase = () => clean(process.env.SUPABASE_URL || 'https://jnajtcuxlgkpplyvvsik.supabase.co').replace(/\\/+$/, '');
function supabaseHeaders() {
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di Vercel.');
  return { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' };
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Method tidak didukung.' });
  const orderId = clean(req.query?.orderId);
  if (!/^BP-[A-Z0-9]+-[A-F0-9]{16}$/.test(orderId)) return json(res, 400, { ok: false, error: 'ID transaksi tidak valid.' });
  try {
    const url = supabaseBase() + '/rest/v1/boothpro_payment_transactions?order_id=eq.' + encodeURIComponent(orderId) + '&select=order_id,gross_amount,transaction_status,payment_type,fraud_status,updated_at&limit=1';
    const r = await fetch(url, { headers: supabaseHeaders(), cache: 'no-store' });
    const rows = await r.json().catch(() => null);
    if (!r.ok) return json(res, 502, { ok: false, error: 'Tidak dapat membaca status notifikasi pembayaran. Pastikan tabel boothpro_payment_transactions sudah dibuat.' });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json(res, 200, { ok: true, paid: false, status: 'pending' });
    const status = clean(row.transaction_status);
    const paid = status === 'settlement' || (status === 'capture' && clean(row.fraud_status) === 'accept');
    return json(res, 200, { ok: true, paid, status, amount: Number(row.gross_amount), orderId: clean(row.order_id), paymentType: clean(row.payment_type), updatedAt: row.updated_at || null });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Pemeriksaan pembayaran gagal.' });
  }
}
