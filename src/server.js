'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const views = require('./views');
const legal = require('./legal');
const zeit = require('./time');
const instagram = require('./instagram');
const stripe = require('./stripe');
const planer = require('./scheduler');
const plan = require('./plan');

const UPLOADS = path.join(config.dataDir, 'uploads');
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com https://www.instagram.com; frame-ancestors 'none'");
  next();
});

// ---------- Stripe-Webhook (braucht den unveränderten Text) ----------
app.post('/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const roh = req.body.toString('utf8');
  if (!config.stripeWebhookSecret || !stripe.webhookPruefen(roh, req.headers['stripe-signature'])) {
    return res.status(400).send('Ungültige Signatur');
  }
  try {
    await stripe.ereignisVerarbeiten(JSON.parse(roh));
    res.json({ ok: true });
  } catch (e) {
    console.error('Stripe-Webhook:', e);
    res.status(500).send('Fehler');
  }
});

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1d' }));
app.use(auth.laden);

const senden = (res, html, status = 200) => res.status(status).type('html').send(html);
const zurueck = (res, ziel, hinweis) => res.redirect(hinweis ? `${ziel}${ziel.includes('?') ? '&' : '?'}hinweis=${encodeURIComponent(hinweis)}` : ziel);

function csrfPflicht(req, res, next) {
  if (!auth.csrfOk(req)) return senden(res, views.fehlerSeite(req, 'Sitzung abgelaufen', 'Bitte lade die Seite neu und versuche es noch einmal.'), 403);
  next();
}

// ---------- Öffentliche Seiten ----------
const registrierungZu = () => config.nurIch && Boolean(db.prepare('SELECT 1 FROM users LIMIT 1').get());

app.get('/', (req, res) => {
  if (req.user) return res.redirect('/app');
  if (config.nurIch) return res.redirect(registrierungZu() ? '/anmelden' : '/registrieren');
  senden(res, views.startseite(req));
});
app.get('/impressum', (req, res) => senden(res, views.text(req, 'Impressum', legal.impressum())));
app.get('/datenschutz', (req, res) => senden(res, views.text(req, 'Datenschutz', legal.datenschutz())));
app.get('/agb', (req, res) => senden(res, views.text(req, 'AGB', legal.agb())));
app.get('/gesund', (req, res) => res.json({ ok: true }));

// Für Formulare von nicht angemeldeten Besuchern: eigenes CSRF-Cookie
function gastCsrf(req, res) {
  let t = (String(req.headers.cookie || '').match(/sp_gast=([a-f0-9]{32})/) || [])[1];
  if (!t) {
    t = crypto.randomBytes(16).toString('hex');
    res.append('Set-Cookie', `sp_gast=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${config.secureCookies ? '; Secure' : ''}`);
  }
  req.csrf = t;
}
function gastCsrfOk(req) {
  const t = (String(req.headers.cookie || '').match(/sp_gast=([a-f0-9]{32})/) || [])[1];
  return Boolean(t) && req.body._csrf === t;
}

app.get('/registrieren', (req, res) => {
  if (req.user) return res.redirect('/app');
  if (registrierungZu()) return res.redirect('/anmelden');
  gastCsrf(req, res);
  senden(res, views.registrieren(req));
});
app.post('/registrieren', (req, res) => {
  gastCsrf(req, res);
  const email = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.passwort || '');
  const fehler = (t) => senden(res, views.registrieren(req, t, email), 400);
  if (!gastCsrfOk(req)) return fehler('Bitte lade die Seite neu und versuche es noch einmal.');
  if (registrierungZu()) return res.redirect('/anmelden');
  if (auth.zuVieleVersuche(req.ip)) return fehler('Zu viele Versuche. Bitte warte 15 Minuten.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return fehler('Bitte gib eine gültige E-Mail-Adresse ein.');
  if (pw.length < 8 || pw.length > 200) return fehler('Das Passwort muss mindestens 8 Zeichen haben.');
  if (req.body.agb !== '1') return fehler('Bitte akzeptiere die AGB.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fehler('Diese E-Mail ist schon registriert. Bitte melde dich an.');
  const jetzt = Date.now();
  const r = db.prepare('INSERT INTO users (email, pw_hash, created_at, trial_ends) VALUES (?, ?, ?, ?)')
    .run(email, auth.hashPasswort(pw), jetzt, jetzt);
  auth.sessionStarten(res, Number(r.lastInsertRowid));
  res.redirect('/app/konten?hinweis=' + encodeURIComponent('Willkommen! Verbinde jetzt dein Instagram-Konto.'));
});

app.get('/anmelden', (req, res) => {
  if (req.user) return res.redirect('/app');
  gastCsrf(req, res);
  senden(res, views.anmelden(req));
});
app.post('/anmelden', (req, res) => {
  gastCsrf(req, res);
  const email = String(req.body.email || '').trim().toLowerCase();
  const fehler = (t) => senden(res, views.anmelden(req, t, email), 400);
  if (!gastCsrfOk(req)) return fehler('Bitte lade die Seite neu und versuche es noch einmal.');
  if (auth.zuVieleVersuche(req.ip)) return fehler('Zu viele Versuche. Bitte warte 15 Minuten.');
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !auth.pruefePasswort(String(req.body.passwort || ''), u.pw_hash)) return fehler('E-Mail oder Passwort stimmt nicht.');
  auth.sessionStarten(res, u.id);
  res.redirect('/app');
});

app.post('/abmelden', csrfPflicht, (req, res) => {
  auth.sessionBeenden(req, res);
  res.redirect('/');
});

// Medien-Link für Instagram (zufälliger, nicht erratbarer Schlüssel)
app.get('/m/:schluessel', (req, res) => {
  const key = String(req.params.schluessel).replace(/\.[a-z0-9]+$/i, '');
  const b = db.prepare(`SELECT file FROM posts WHERE public_key = ? AND status IN ('geplant', 'laeuft')`).get(key);
  if (!b || !b.file) return res.status(404).send('Nicht gefunden');
  res.sendFile(path.join(UPLOADS, b.file));
});

// ---------- Ab hier nur angemeldet ----------
app.use('/app', auth.nurAngemeldet);

const kontenVon = (userId) => db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY username').all(userId);
const MIT_KONTO = 'SELECT p.*, a.username FROM posts p JOIN accounts a ON a.id = p.account_id';

app.get('/app', (req, res) => {
  const jetzt = zeit.teile(Date.now());
  let [jahr, monat] = [jetzt.year, jetzt.month];
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.m || ''));
  if (m && +m[2] >= 1 && +m[2] <= 12) [jahr, monat] = [+m[1], +m[2]];
  const zwei = (n) => String(n).padStart(2, '0');
  const von = zeit.berlinZuUtc(`${jahr}-${zwei(monat)}-01T00:00`);
  const bis = monat === 12 ? zeit.berlinZuUtc(`${jahr + 1}-01-01T00:00`) : zeit.berlinZuUtc(`${jahr}-${zwei(monat + 1)}-01T00:00`);
  const beitraege = db.prepare(`${MIT_KONTO} WHERE p.user_id = ? AND p.scheduled_at >= ? AND p.scheduled_at < ? ORDER BY p.scheduled_at`)
    .all(req.user.id, von, bis);
  const kommende = db.prepare(`${MIT_KONTO} WHERE p.user_id = ? AND (p.status IN ('geplant', 'laeuft', 'fehler')
      OR (p.status = 'gepostet' AND p.posted_at > ?)) ORDER BY p.scheduled_at LIMIT 30`).all(req.user.id, Date.now() - 2 * 86400000);
  senden(res, views.kalender(req, { jahr, monat, beitraege, kommende, konten: kontenVon(req.user.id), premium: plan.istPremium(req.user), imMonat: plan.beitraegeImMonat(req.user.id, Date.now()) }));
});

// Datei für die Vorschau (nur eigene Beiträge)
app.get('/app/datei/:id', (req, res) => {
  const b = db.prepare('SELECT file FROM posts WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!b || !b.file) return res.status(404).send('Nicht gefunden');
  res.sendFile(path.join(UPLOADS, b.file));
});

const TYPEN = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'image/jpeg': '.jpg' };
const hochladen = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + TYPEN[file.mimetype]),
  }),
  limits: { fileSize: config.maxVideoMB * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, Boolean(TYPEN[file.mimetype])),
}).single('datei');

function mitUpload(req, res, next) {
  hochladen(req, res, (err) => {
    if (err) {
      req.uploadFehler = err.code === 'LIMIT_FILE_SIZE' ? `Die Datei ist zu groß (max. ${config.maxVideoMB} MB).` : 'Hochladen fehlgeschlagen.';
    }
    if (!auth.csrfOk(req)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return senden(res, views.fehlerSeite(req, 'Sitzung abgelaufen', 'Bitte lade die Seite neu und versuche es noch einmal.'), 403);
    }
    next();
  });
}

// Eingaben prüfen; gibt Fehlertext oder null zurück
function eingabenPruefen(req) {
  const konto = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(Number(req.body.konto), req.user.id);
  if (!konto) return { fehler: 'Bitte wähle ein Instagram-Konto.' };
  const wann = zeit.berlinZuUtc(req.body.zeit);
  if (!wann) return { fehler: 'Bitte wähle Datum und Uhrzeit.' };
  if (wann < Date.now() - 60000) return { fehler: 'Der Zeitpunkt liegt in der Vergangenheit.' };
  if (wann > Date.now() + 365 * 86400000) return { fehler: 'Bitte plane höchstens ein Jahr im Voraus.' };
  const text = String(req.body.text || '').replace(/\r\n/g, '\n');
  if (text.length > 2200) return { fehler: 'Der Text ist länger als 2.200 Zeichen.' };
  if ((text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) return { fehler: 'Instagram erlaubt höchstens 30 Hashtags.' };
  return { kontoId: konto.id, wann, text, story: req.body.art === 'story' ? 1 : 0 };
}

app.get('/app/neu', (req, res) => {
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.datum || '')) ? req.query.datum : null;
  let vorschlag = datum ? `${datum}T18:00` : zeit.fuerEingabe(Date.now() + 3600000);
  if (zeit.berlinZuUtc(vorschlag) < Date.now()) vorschlag = zeit.fuerEingabe(Date.now() + 3600000);
  senden(res, views.beitragFormular(req, { konten: kontenVon(req.user.id), werte: { zeit: vorschlag } }));
});

app.post('/app/neu', mitUpload, (req, res) => {
  const konten = kontenVon(req.user.id);
  const nochmal = (fehler) => {
    if (req.file) fs.unlink(req.file.path, () => {});
    senden(res, views.beitragFormular(req, { konten, fehler, werte: req.body }), 400);
  };
  if (req.uploadFehler) return nochmal(req.uploadFehler);
  if (!req.file) return nochmal('Bitte wähle ein Video (MP4/MOV) oder ein Bild (JPG).');
  const istBild = req.file.mimetype === 'image/jpeg';
  if (istBild && req.file.size > config.maxImageMB * 1024 * 1024) return nochmal(`Bilder dürfen höchstens ${config.maxImageMB} MB groß sein.`);
  const p = eingabenPruefen(req);
  if (p.fehler) return nochmal(p.fehler);
  const limit = plan.planenPruefen(req.user, p.wann);
  if (limit) return nochmal(limit);
  db.prepare(`INSERT INTO posts (user_id, account_id, media_type, als_story, file, public_key, caption, scheduled_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, p.kontoId, istBild ? 'IMAGE' : 'REELS', p.story, req.file.filename, crypto.randomBytes(24).toString('hex'), p.text, p.wann, Date.now());
  const t = zeit.teile(p.wann);
  zurueck(res, `/app?m=${t.year}-${String(t.month).padStart(2, '0')}`, `Geplant für ${zeit.datumText(p.wann)}.`);
});

const eigenerBeitrag = (req) => db.prepare(`${MIT_KONTO} WHERE p.id = ? AND p.user_id = ?`).get(Number(req.params.id), req.user.id);

app.get('/app/beitrag/:id', (req, res) => {
  const b = eigenerBeitrag(req);
  if (!b) return senden(res, views.fehlerSeite(req, 'Nicht gefunden', 'Diesen Beitrag gibt es nicht.'), 404);
  if (b.status === 'gepostet' || b.status === 'laeuft') {
    return senden(res, views.text(req, 'Beitrag', `<h1>Beitrag</h1><p>Dieser Beitrag ist ${b.status === 'gepostet' ? 'bereits veröffentlicht' : 'gerade in Arbeit'} und kann nicht mehr geändert werden.</p>
      ${b.permalink ? `<p><a class="knopf" href="${views.e(b.permalink)}" target="_blank" rel="noopener">Auf Instagram ansehen</a></p>` : ''}<p><a href="/app">Zurück zum Kalender</a></p>`));
  }
  if (!b.file) return senden(res, views.fehlerSeite(req, 'Datei fehlt', 'Die Datei zu diesem Beitrag ist nicht mehr vorhanden. Bitte lege ihn neu an.'));
  senden(res, views.beitragFormular(req, { konten: kontenVon(req.user.id), beitrag: b }));
});

app.post('/app/beitrag/:id', mitUpload, (req, res) => {
  if (req.file) fs.unlink(req.file.path, () => {});
  const b = eigenerBeitrag(req);
  if (!b || !['geplant', 'fehler'].includes(b.status)) return zurueck(res, '/app', 'Dieser Beitrag kann nicht mehr geändert werden.');
  const p = eingabenPruefen(req);
  if (!p.fehler) p.fehler = plan.planenPruefen(req.user, p.wann, b.id);
  if (p.fehler) {
    return senden(res, views.beitragFormular(req, { konten: kontenVon(req.user.id), beitrag: b, fehler: p.fehler, werte: req.body }), 400);
  }
  db.prepare(`UPDATE posts SET account_id = ?, caption = ?, scheduled_at = ?, als_story = ?, status = 'geplant', attempts = 0, error = NULL
              WHERE id = ? AND status IN ('geplant', 'fehler')`).run(p.kontoId, p.text, p.wann, p.story, b.id);
  zurueck(res, '/app', `Gespeichert. Geplant für ${zeit.datumText(p.wann)}.`);
});

function dateiLoeschen(datei) {
  if (datei) fs.unlink(path.join(UPLOADS, datei), () => {});
}

app.post('/app/beitrag/:id/loeschen', csrfPflicht, (req, res) => {
  const b = eigenerBeitrag(req);
  if (b && b.status !== 'laeuft') {
    db.prepare('DELETE FROM posts WHERE id = ?').run(b.id);
    dateiLoeschen(b.file);
  }
  zurueck(res, '/app', 'Beitrag gelöscht.');
});

// ---------- Instagram-Konten ----------
app.get('/app/konten', (req, res) => senden(res, views.konten(req, kontenVon(req.user.id))));

app.post('/app/konten/demo', csrfPflicht, (req, res) => {
  if (!config.demoInstagram) return res.redirect('/app/konten');
  const limit = plan.kontoPruefen(req.user);
  if (limit) return zurueck(res, '/app/konten', limit);
  db.prepare(`INSERT OR IGNORE INTO accounts (user_id, ig_user_id, username, demo, created_at) VALUES (?, 'demo', 'mein.demo.konto', 1, ?)`)
    .run(req.user.id, Date.now());
  zurueck(res, '/app/konten', 'Demo-Konto verbunden.');
});

function kontoEntfernen(kontoId) {
  for (const b of db.prepare('SELECT file FROM posts WHERE account_id = ?').all(kontoId)) dateiLoeschen(b.file);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(kontoId);
}

app.post('/app/konten/:id/trennen', csrfPflicht, (req, res) => {
  const k = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (k) kontoEntfernen(k.id);
  zurueck(res, '/app/konten', 'Konto getrennt.');
});

app.get('/instagram/verbinden', auth.nurAngemeldet, (req, res) => {
  if (config.demoInstagram) return res.redirect('/app/konten');
  const limit = plan.kontoPruefen(req.user);
  if (limit) return zurueck(res, '/app/konten', limit);
  const state = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO oauth_states (state, user_id, expires) VALUES (?, ?, ?)').run(state, req.user.id, Date.now() + 15 * 60000);
  res.redirect(instagram.loginUrl(state));
});

app.get('/instagram/callback', auth.nurAngemeldet, async (req, res) => {
  const state = String(req.query.state || '');
  const ok = db.prepare('SELECT 1 FROM oauth_states WHERE state = ? AND user_id = ? AND expires > ?').get(state, req.user.id, Date.now());
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  if (!ok) return zurueck(res, '/app/konten', 'Die Verbindung ist abgelaufen. Bitte noch einmal versuchen.');
  if (req.query.error || !req.query.code) return zurueck(res, '/app/konten', 'Verbindung abgebrochen.');
  try {
    const k = await instagram.codeEinloesen(req.query.code);
    const schonDa = db.prepare('SELECT 1 FROM accounts WHERE user_id = ? AND ig_user_id = ?').get(req.user.id, k.igUserId);
    const limit = !schonDa && plan.kontoPruefen(req.user);
    if (limit) return zurueck(res, '/app/konten', limit);
    db.prepare(`INSERT INTO accounts (user_id, ig_user_id, username, token, token_expires, created_at) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, ig_user_id) DO UPDATE SET username = excluded.username, token = excluded.token,
                token_expires = excluded.token_expires, created_at = excluded.created_at`)
      .run(req.user.id, k.igUserId, k.username, k.token, k.ablauf, Date.now());
    zurueck(res, '/app/konten', `@${k.username} ist verbunden.`);
  } catch (e) {
    console.error('Instagram-Verbindung:', e.message);
    zurueck(res, '/app/konten', `Instagram-Verbindung fehlgeschlagen: ${e.message}`);
  }
});

// Rückrufe von Meta: Nutzer entfernt die App bzw. verlangt Datenlöschung
function metaKontoLoeschen(req) {
  const daten = instagram.signedRequestLesen(req.body.signed_request);
  if (!daten || !daten.user_id) return null;
  for (const k of db.prepare('SELECT id FROM accounts WHERE ig_user_id = ?').all(String(daten.user_id))) kontoEntfernen(k.id);
  return daten;
}
app.post('/instagram/deauthorize', (req, res) => {
  metaKontoLoeschen(req);
  res.json({ ok: true });
});
app.post('/instagram/datenloeschung', (req, res) => {
  if (!metaKontoLoeschen(req)) return res.status(400).json({ error: 'ungültig' });
  const code = crypto.randomBytes(8).toString('hex');
  res.json({ url: `${config.baseUrl}/datenloeschung?code=${code}`, confirmation_code: code });
});
app.get('/datenloeschung', (req, res) => senden(res, views.text(req, 'Datenlöschung',
  `<h1>Datenlöschung</h1><p>Deine Instagram-Verbindung und alle zugehörigen Daten wurden gelöscht.</p><p class="klein">Bestätigungscode: ${views.e(req.query.code || '')}</p>`)));

// ---------- Abo ----------
app.get('/app/abo', (req, res) => senden(res, views.abo(req, { premium: plan.istPremium(req.user), imMonat: plan.beitraegeImMonat(req.user.id, Date.now()) })));

app.post('/app/abo/kaufen', csrfPflicht, async (req, res) => {
  if (!config.billingEnabled) return res.redirect('/app/abo');
  try {
    res.redirect(303, await stripe.kaufLink(req.user));
  } catch (e) {
    console.error('Stripe:', e.message);
    zurueck(res, '/app/abo', 'Die Bezahlseite ist gerade nicht erreichbar. Bitte später noch einmal versuchen.');
  }
});

app.post('/app/abo/verwalten', csrfPflicht, async (req, res) => {
  if (!config.billingEnabled || !req.user.stripe_customer) return res.redirect('/app/abo');
  try {
    res.redirect(303, await stripe.verwaltenLink(req.user));
  } catch (e) {
    console.error('Stripe:', e.message);
    zurueck(res, '/app/abo', 'Die Verwaltung ist gerade nicht erreichbar. Bitte später noch einmal versuchen.');
  }
});

// ---------- Profil ----------
app.get('/app/konto', (req, res) => senden(res, views.profil(req)));

app.post('/app/konto/loeschen', csrfPflicht, (req, res) => {
  for (const b of db.prepare('SELECT file FROM posts WHERE user_id = ?').all(req.user.id)) dateiLoeschen(b.file);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  auth.sessionBeenden(req, res);
  zurueck(res, '/', 'Dein Konto wurde gelöscht.');
});

app.use((req, res) => senden(res, views.fehlerSeite(req, 'Seite nicht gefunden', 'Diese Seite gibt es nicht.'), 404));
app.use((err, req, res, next) => {
  console.error(err);
  senden(res, views.fehlerSeite(req, 'Fehler', 'Da ist etwas schiefgelaufen. Bitte versuche es noch einmal.'), 500);
});

if (require.main === module) {
  if (config.sessionSecret === 'bitte-in-.env-aendern') console.warn('WARNUNG: SESSION_SECRET in .env setzen!');
  app.listen(config.port, () => {
    console.log(`${config.appName} läuft auf ${config.baseUrl}`);
    if (config.demoInstagram) console.log('Demo-Modus: Instagram-Zugangsdaten fehlen, Posten wird nur simuliert.');
    if (!config.billingEnabled) console.log('Bezahlung aus: Stripe-Schlüssel fehlt, alles ist freigeschaltet.');
  });
  planer.starten();
}

module.exports = app;
