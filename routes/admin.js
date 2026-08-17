const path = require('path');
const bcrypt = require('bcryptjs');
const express = require('express');

const { db, getSetting, setSetting, UPLOADS_DIR } = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

router.get('/admin/api/me', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.user),
    username: req.session.user || null,
  });
});

router.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  req.session.user = admin.username;
  res.json({ ok: true });
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/admin/api/settings', requireAuth, (req, res) => {
  res.json({
    destination_url: getSetting('destination_url'),
    entry_token: getSetting('entry_token'),
  });
});

router.post('/admin/api/settings', requireAuth, (req, res) => {
  const { destination_url, entry_token } = req.body || {};
  if (destination_url && typeof destination_url === 'string' && destination_url.length <= 2048) {
    const url = destination_url.trim();
    if (/^https?:\/\//i.test(url)) {
      setSetting('destination_url', url);
    }
  }
  if (entry_token && typeof entry_token === 'string' && /^[a-zA-Z0-9-]{4,64}$/.test(entry_token.trim())) {
    setSetting('entry_token', entry_token.trim());
  }
  res.json({
    ok: true,
    destination_url: getSetting('destination_url'),
    entry_token: getSetting('entry_token'),
  });
});

router.get('/admin/api/captures', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 12;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM captures').get();
  const captures = db
    .prepare('SELECT * FROM captures ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(perPage, (page - 1) * perPage);
  res.json({ captures, total: n, page, perPage });
});

router.get('/captures/:file', requireAuth, (req, res) => {
  const file = path.basename(req.params.file);
  res.sendFile(path.join(UPLOADS_DIR, file));
});

module.exports = router;
