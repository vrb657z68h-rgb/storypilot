'use strict';
// Privater Modus ohne Code: Besitzer wird automatisch angelegt, Anmeldung per Zugangslink
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'storypilot-zugang-'));
process.env.DATA_DIR = ordner;
process.env.INSTAGRAM_APP_ID = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.MODUS = 'nur-ich';
process.env.ERSTER_CODE = '';

const app = require('../src/server');
const { client } = require('./hilfe');
const c = client(app);
test.before(() => c.start());
test.after(() => c.stop());

test('Anmeldung per Zugangslink', async () => {
  let r = await c.holen('/registrieren');
  assert.strictEqual(r.ort, '/anmelden');
  r = await c.holen('/zugang/falsch');
  assert.strictEqual(r.status, 404);
  const token = fs.readFileSync(path.join(ordner, 'zugang'), 'utf8').trim();
  r = await c.holen(`/zugang/${token}`);
  assert.strictEqual(r.ort, '/app');
  r = await c.holen('/app');
  assert.strictEqual(r.status, 200);
  r = await c.holen('/app/konto');
  assert.match(r.text, new RegExp(`/zugang/${token}`));
});
