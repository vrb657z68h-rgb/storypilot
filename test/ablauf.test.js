'use strict';
// Kompletter Ablauf im Demo-Modus: registrieren, Konto verbinden, Reel planen, posten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'storypilot-test-'));
process.env.DATA_DIR = ordner;
process.env.INSTAGRAM_APP_ID = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.BASE_URL = 'http://localhost:0';

const app = require('../src/server');
const db = require('../src/db');
const planer = require('../src/scheduler');
const zeit = require('../src/time');

const { client, csrfAus } = require('./hilfe');
const c = client(app);
const holen = (...a) => c.holen(...a);
test.before(() => c.start());
test.after(() => c.stop());

test('Zeitumrechnung deutsche Zeit', () => {
  assert.strictEqual(zeit.berlinZuUtc('2026-07-01T12:00'), Date.UTC(2026, 6, 1, 10, 0)); // Sommerzeit
  assert.strictEqual(zeit.berlinZuUtc('2026-12-01T12:00'), Date.UTC(2026, 11, 1, 11, 0)); // Winterzeit
  assert.strictEqual(zeit.fuerEingabe(Date.UTC(2026, 11, 1, 11, 0)), '2026-12-01T12:00');
});

test('kompletter Ablauf', async () => {
  let r = await holen('/');
  assert.match(r.text, /Storypilot/);

  r = await holen('/registrieren');
  const form = new URLSearchParams({ _csrf: csrfAus(r.text), email: 'test@example.com', passwort: 'geheim123', agb: '1' });
  r = await holen('/registrieren', { method: 'POST', body: form });
  assert.strictEqual(r.status, 302, r.text);

  // Ohne CSRF-Token wird nichts angenommen
  r = await holen('/app/konten/demo', { method: 'POST', body: new URLSearchParams({}) });
  assert.strictEqual(r.status, 403);

  r = await holen('/app/konten');
  r = await holen('/app/konten/demo', { method: 'POST', body: new URLSearchParams({ _csrf: csrfAus(r.text) }) });
  r = await holen('/app/konten');
  assert.match(r.text, /mein\.demo\.konto/);

  // Reel planen (in 2 Minuten)
  r = await holen('/app/neu');
  const csrf = csrfAus(r.text);
  const kontoId = r.text.match(/<option value="(\d+)"/)[1];
  const fd = new FormData();
  fd.append('_csrf', csrf);
  fd.append('konto', kontoId);
  fd.append('zeit', zeit.fuerEingabe(Date.now() + 120000));
  fd.append('text', 'Testreel #wetter');
  fd.append('datei', new Blob([Buffer.alloc(1000)], { type: 'video/mp4' }), 'reel.mp4');
  r = await holen('/app/neu', { method: 'POST', body: fd });
  assert.strictEqual(r.status, 302, r.text);

  let b = db.prepare('SELECT * FROM posts').get();
  assert.strictEqual(b.status, 'geplant');
  assert.strictEqual(b.media_type, 'REELS');

  // Medien-Link ist öffentlich erreichbar, solange geplant
  r = await holen(`/m/${b.public_key}.mp4`);
  assert.strictEqual(r.status, 200);

  // Noch nicht fällig
  await planer.takt();
  assert.strictEqual(db.prepare('SELECT status FROM posts').get().status, 'geplant');

  // Fällig machen und posten
  db.prepare('UPDATE posts SET scheduled_at = ?').run(Date.now() - 1000);
  await planer.takt();
  b = db.prepare('SELECT * FROM posts').get();
  assert.strictEqual(b.status, 'gepostet');

  r = await holen(`/m/${b.public_key}.mp4`);
  assert.strictEqual(r.status, 404);

  r = await holen('/app');
  assert.match(r.text, /Gepostet/);

  // Fremde Dateien sind geschützt
  c.abmelden();
  r = await holen(`/app/datei/${b.id}`);
  assert.strictEqual(r.status, 302);
});

test('Zeitpunkt in der Vergangenheit wird abgelehnt', async () => {
  c.abmelden();
  let r = await holen('/anmelden');
  r = await holen('/anmelden', { method: 'POST', body: new URLSearchParams({ _csrf: csrfAus(r.text), email: 'test@example.com', passwort: 'geheim123' }) });
  assert.strictEqual(r.status, 302);
  r = await holen('/app/neu');
  const fd = new FormData();
  fd.append('_csrf', csrfAus(r.text));
  fd.append('konto', r.text.match(/<option value="(\d+)"/)[1]);
  fd.append('zeit', '2020-01-01T10:00');
  fd.append('text', 'alt');
  fd.append('datei', new Blob([Buffer.alloc(100)], { type: 'image/jpeg' }), 'bild.jpg');
  r = await holen('/app/neu', { method: 'POST', body: fd });
  assert.strictEqual(r.status, 400);
  assert.match(r.text, /Vergangenheit/);
  // hochgeladene Datei wurde wieder entfernt
  const dateien = fs.readdirSync(path.join(ordner, 'uploads'));
  assert.strictEqual(dateien.length, 1);
});
