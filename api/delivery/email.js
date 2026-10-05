const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm']);

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

function extensionFor(filename, contentType) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
  return map[String(contentType || '').toLowerCase()] || '';
}

function safeFilename(value, fallback) {
  const clean = String(value || fallback).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return clean || fallback;
}

async function fetchAsset(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Asset harus HTTPS.');
    if (!allowedHost(url)) throw new Error('Host asset tidak diizinkan oleh server.');
  } catch (e) {
    throw new Error(e?.message || 'URL asset tidak valid.');
  }

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) throw new Error('Asset kosong.');
  return { contentType, bytes: Buffer.from(arrayBuffer) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.BOOTHPRO_EMAIL_FROM || '').trim();
  if (!apiKey || !from) {
    return json(res, 503, { ok: false, error: 'Email delivery belum dikonfigurasi di server (RESEND_API_KEY / BOOTHPRO_EMAIL_FROM).' });
  }

  const to = String(req.body?.to || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(to)) return json(res, 400, { ok: false, error: 'Email pelanggan tidak valid.' });

  const subject = String(req.body?.subject || 'Soft File Foto BoothPro Anda').trim().slice(0, 160);
  const message = String(req.body?.message || 'Berikut soft file foto BoothPro Anda.').trim().slice(0, 4000);
  const requested = Array.isArray(req.body?.media) ? req.body.media.slice(0, 3) : [];
  if (!requested.length) return json(res, 400, { ok: false, error: 'Minimal satu attachment diperlukan.' });

  try {
    const attachments = [];
    for (const item of requested) {
      const url = String(item?.url || '').trim();
      if (!url) continue;
      const asset = await fetchAsset(url);
      const ext = extensionFor(item?.filename, asset.contentType);
      if (!ext) throw new Error('Format attachment tidak didukung.');
      attachments.push({
        filename: safeFilename(item?.filename, `BoothPro-${attachments.length + 1}.${ext}`),
        content: asset.bytes.toString('base64')
      });
    }

    if (!attachments.length) return json(res, 400, { ok: false, error: 'Tidak ada attachment yang berhasil dibaca.' });

    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b"><h2>Soft File Foto BoothPro Anda</h2><p>${message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p><p>File foto, GIF, dan video terlampir langsung pada email ini.</p></div>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, attachments })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, { ok: false, error: data?.message || `Resend HTTP ${response.status}` });

    return json(res, 200, { ok: true, id: data?.id || null, to, attachmentCount: attachments.length });
  } catch (error) {
    console.error('BoothPro email delivery:', error);
    return json(res, 502, { ok: false, error: error?.message || 'Email delivery failed' });
  }
}
