const ALLOWED_TYPES = new Set(['image', 'video', 'document']);

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  return phone;
}

function allowedHost(url) {
  const raw = String(process.env.DELIVERY_ALLOWED_HOSTS || '').trim();
  if (!raw) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).some(x => host === x || host.endsWith('.' + x));
  } catch (_) {
    return false;
  }
}

function cleanMedia(input) {
  const type = String(input?.type || '').toLowerCase();
  const url = String(input?.url || '').trim();
  const filename = String(input?.filename || '').trim().slice(0, 120);
  const caption = String(input?.caption || '').trim().slice(0, 1024);
  if (!ALLOWED_TYPES.has(type) || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (!allowedHost(url)) return null;
  } catch (_) {
    return null;
  }
  return { type, url, filename, caption };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const token = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = String(process.env.WHATSAPP_API_VERSION || 'v23.0').trim();
  if (!token || !phoneNumberId) {
    return json(res, 503, { ok: false, error: 'WhatsApp Cloud API belum dikonfigurasi di server.' });
  }

  const to = normalizePhone(req.body?.to);
  if (!/^\d{8,15}$/.test(to)) return json(res, 400, { ok: false, error: 'Nomor WhatsApp tidak valid.' });

  const media = Array.isArray(req.body?.media) ? req.body.media.map(cleanMedia).filter(Boolean).slice(0, 3) : [];
  if (!media.length) return json(res, 400, { ok: false, error: 'Minimal satu media diperlukan.' });

  const base = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
  const results = [];

  try {
    for (const item of media) {
      const payload = { messaging_product: 'whatsapp', to };
      if (item.type === 'image') {
        payload.type = 'image';
        payload.image = { link: item.url, ...(item.caption ? { caption: item.caption } : {}) };
      } else if (item.type === 'video') {
        payload.type = 'video';
        payload.video = { link: item.url, ...(item.caption ? { caption: item.caption } : {}) };
      } else {
        payload.type = 'document';
        payload.document = { link: item.url, ...(item.filename ? { filename: item.filename } : {}), ...(item.caption ? { caption: item.caption } : {}) };
      }

      const response = await fetch(base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json(res, response.status, {
          ok: false,
          error: data?.error?.message || `WhatsApp API HTTP ${response.status}`,
          sent: results
        });
      }
      results.push({ type: item.type, messageId: data?.messages?.[0]?.id || null });
    }

    return json(res, 200, { ok: true, to, sent: results, count: results.length });
  } catch (error) {
    console.error('BoothPro WhatsApp delivery:', error);
    return json(res, 502, { ok: false, error: error?.message || 'WhatsApp delivery failed', sent: results });
  }
}
