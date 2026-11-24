'use strict';
// Privater Modus: nur ein Konto
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storypilot-nurich-'));
process.env.INSTAGRAM_APP_ID = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.MODUS = 'nur-ich';
process.env.ERSTER_CODE = 'sonne42';

const app = require('../src/server');
const { client, registrieren } = require('./hilfe');
const c = client(app);
test.before(() => c.start());
test.after(() => c.stop());

test('nur das erste Konto kann sich registrieren', async () => {
  let r = await c.holen('/');
  assert.strictEqual(r.ort, '/registrieren');
  r = await registrieren(c, 'ich@example.com', { code: 'falsch' });
  assert.strictEqual(r.status, 400);
  assert.match(r.text, /Einrichtungs-Code/);
  r = await registrieren(c, 'ich@example.com', { code: 'sonne42' });
  assert.strictEqual(r.status, 302);
  c.abmelden();
  r = await c.holen('/');
  assert.strictEqual(r.ort, '/anmelden');
  r = await c.holen('/registrieren');
  assert.strictEqual(r.ort, '/anmelden');
});

test('Instagram-Zugangsdaten über die Einrichtungsseite', async () => {
  const { csrfAus } = require('./hilfe');
  const config = require('../src/config');
  let r = await c.holen('/anmelden');
  r = await c.holen('/anmelden', { method: 'POST', body: new URLSearchParams({ _csrf: csrfAus(r.text), email: 'ich@example.com', passwort: 'geheim123' }) });
  r = await c.holen('/app/konten');
  assert.match(r.text, /Instagram einrichten/);
  r = await c.holen('/app/einrichtung');
  assert.match(r.text, /instagram\/callback/);
  r = await c.holen('/app/einrichtung', { method: 'POST', body: new URLSearchParams({ _csrf: csrfAus(r.text), app_id: '1234567890', app_secret: 'abcdef0123456789abcdef0123456789' }) });
  assert.strictEqual(r.status, 302);
  assert.strictEqual(config.demoInstagram, false);
  r = await c.holen('/instagram/verbinden');
  assert.match(r.ort, /^https:\/\/www\.instagram\.com\/oauth\/authorize\?.*client_id=1234567890/);
});
