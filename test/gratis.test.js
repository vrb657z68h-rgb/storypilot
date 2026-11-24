'use strict';
// Gratis-Version: Limits greifen, wenn die Bezahlung eingerichtet ist
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storypilot-gratis-'));
process.env.INSTAGRAM_APP_ID = '';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_PRICE_ID = 'price_dummy';
process.env.FREE_POSTS = '2';

const app = require('../src/server');
const db = require('../src/db');
const planer = require('../src/scheduler');
const zeit = require('../src/time');
const { client, registrieren, demoKonto, planen } = require('./hilfe');

const c = client(app);
test.before(() => c.start());
test.after(() => c.stop());

test('Gratis-Limit für Beiträge und Story', async () => {
  await registrieren(c, 'gratis@example.com');
  await demoKonto(c);
  const bald = zeit.fuerEingabe(Date.now() + 120000);
  let r = await planen(c, { zeitText: bald, art: 'story', typ: 'image/jpeg', name: 'a.jpg' });
  assert.strictEqual(r.status, 302, r.text);
  assert.strictEqual(db.prepare('SELECT als_story FROM posts').get().als_story, 1);
  r = await planen(c, { zeitText: bald });
  assert.strictEqual(r.status, 302);
  r = await planen(c, { zeitText: bald });
  assert.strictEqual(r.status, 400);
  assert.match(r.text, /Gratis-Version/);

  r = await c.holen('/app');
  assert.match(r.text, /2 von 2 Beiträgen/);

  // Zweites Konto geht gratis nicht
  db.prepare("UPDATE accounts SET ig_user_id = 'x'").run();
  r = await demoKonto(c);
  assert.match(decodeURIComponent(r.ort), /Gratis-Version/);

  // Mit Premium geht mehr
  db.prepare("UPDATE users SET sub_status = 'active'").run();
  r = await planen(c, { zeitText: bald });
  assert.strictEqual(r.status, 302);

  // Nach Kündigung werden nur 2 Beiträge im Monat gepostet
  db.prepare("UPDATE users SET sub_status = 'canceled'").run();
  db.prepare('UPDATE posts SET scheduled_at = ?').run(Date.now() - 1000);
  await planer.takt();
  const status = db.prepare('SELECT status FROM posts ORDER BY id').all().map((x) => x.status);
  assert.deepStrictEqual(status, ['gepostet', 'gepostet', 'fehler']);
});
