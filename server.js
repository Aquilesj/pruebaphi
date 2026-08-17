require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { db } = require('./db');
const captureRoutes = require('./routes/capture');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);

app.use(express.json({ limit: '4mb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-cambiar-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use(captureRoutes);
app.use(adminRoutes);

app.use((req, res) => {
  res.status(404).send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
