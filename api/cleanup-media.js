/**
 * BoothPro Cloudinary retention worker.
 *
 * Required Vercel environment variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * - BOOTHPRO_CLEANUP_SECRET
 *
 * Policy:
 * - never deletes on a browser download click;
 * - eligible when downloaded_at is older than BOOTHPRO_RETENTION_GRACE_HOURS,
 *   OR expires_at is in the past;
 * - only deletes media whose public IDs are recorded in the manifest;
 * - marks the manifest as deleted only after Cloudinary deletion succeeds.
 */

const crypto = require('crypto');

const json = (res, status, body) => {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
};

function signCloudinary(params, secret) {
  const body = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => k + '=' + params[k])
    .join('&');
  return crypto.createHash('sha1').update(body + secret).digest('hex');
}

async function destroyCloudinary(publicId, resourceType, cfg) {
  if (!publicId) return { skipped: true };
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  const signature = signCloudinary(params, cfg.apiSecret);
  const endpoint = 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(cfg.cloudName) +
    '/' + (resourceType === 'video' ? 'video' : 'image') + '/destroy';

  const form = new URLSearchParams();
  form.set('public_id', publicId);
  form.set('timestamp', String(timestamp));
  form.set('api_key', cfg.apiKey);
  form.set('signature', signature);

  const response = await fetch(endpoint, { method: 'POST', body: form });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok || (data.result !== 'ok' && data.result !== 'not found')) {
    throw new Error('Cloudinary destroy gagal untuk ' + publicId + ': ' + (data.error?.message || data.result || response.status));
  }
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method tidak didukung' });
  }

  const secret = process.env.BOOTHPRO_CLEANUP_SECRET;
  if (!secret || req.headers['x-boothpro-cleanup-secret'] !== secret) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) return json(res, 500, { ok: false, error: 'Environment belum lengkap', missing });

  const supabase = process.env.SUPABASE_URL.replace(/\/$/, '');
  const graceHours = Math.max(1, Number(process.env.BOOTHPRO_RETENTION_GRACE_HOURS || 24));
  const batchSize = Math.min(100, Math.max(1, Number(process.env.BOOTHPRO_CLEANUP_BATCH_SIZE || 25)));
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - graceHours * 3600000).toISOString();

  const query = new URLSearchParams({
    select: 'id,user_id,booth_id,session_id,photo_public_id,gif_public_id,video_public_id,download_status,downloaded_at,expires_at,media_status',
    limit: String(batchSize),
    order: 'created_at.asc'
  });
  // Eligible rows are either expired, or successfully downloaded and past grace.
  query.set('or', '(expires_at.lt.' + encodeURIComponent(now.toISOString()) + ',and(download_status.eq.downloaded,downloaded_at.lt.' + encodeURIComponent(graceCutoff) + '))');

  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
    Accept: 'application/json'
  };

  const response = await fetch(supabase + '/rest/v1/boothpro_session_manifest?' + query.toString(), { headers });
  let rows = [];
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch (_) {}
    return json(res, 502, { ok: false, error: data.message || 'Supabase query gagal' });
  }
  try { rows = await response.json(); } catch (_) {}

  const results = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const media = [
      ['photo_public_id', 'image'],
      ['gif_public_id', 'image'],
      ['video_public_id', 'video']
    ];
    const deleted = [];
    try {
      for (const [field, type] of media) {
        if (row[field]) {
          await destroyCloudinary(row[field], type, {
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            apiKey: process.env.CLOUDINARY_API_KEY,
            apiSecret: process.env.CLOUDINARY_API_SECRET
          });
          deleted.push(field);
        }
      }

      const patch = {
        media_status: 'deleted',
        photo_url: null,
        photo_public_id: null,
        gif_url: null,
        gif_public_id: null,
        video_url: null,
        video_public_id: null,
        updated_at: new Date().toISOString()
      };
      const update = await fetch(
        supabase + '/rest/v1/boothpro_session_manifest?id=eq.' + encodeURIComponent(row.id),
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(patch)
        }
      );
      if (!update.ok) throw new Error('Manifest update gagal untuk ' + row.id);
      results.push({ id: row.id, session_id: row.session_id, deleted });
    } catch (error) {
      results.push({ id: row.id, session_id: row.session_id, error: error.message });
    }
  }

  return json(res, 200, {
    ok: true,
    checked: Array.isArray(rows) ? rows.length : 0,
    processed: results.length,
    grace_hours: graceHours,
    results
  });
};
