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

const app = require('../src/server');
const { client, registrieren } = require('./hilfe');
const c = client(app);
test.before(() => c.start());
test.after(() => c.stop());

test('nur das erste Konto kann sich registrieren', async () => {
  let r = await c.holen('/');
  assert.strictEqual(r.ort, '/registrieren');
  r = await registrieren(c, 'ich@example.com');
  assert.strictEqual(r.status, 302);
  c.abmelden();
  r = await c.holen('/');
  assert.strictEqual(r.ort, '/anmelden');
  r = await c.holen('/registrieren');
  assert.strictEqual(r.ort, '/anmelden');
});
