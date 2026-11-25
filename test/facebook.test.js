'use strict';
// Schlüssel aus Facebook Login for Business / Unified Login (beginnen mit EAA)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storypilot-fb-'));
process.env.INSTAGRAM_APP_ID = '';
const instagram = require('../src/instagram');

function falscheSchnittstelle(antworten) {
  const aufrufe = [];
  global.fetch = async (url, opt = {}) => {
    const u = String(url);
    aufrufe.push({ url: u, body: opt.body ? String(opt.body) : '' });
    const treffer = antworten.find(([muster]) => u.includes(muster));
    const daten = treffer ? treffer[1] : { error: { message: 'unbekannt', code: 100 } };
    return { ok: !daten.error, status: daten.error ? 400 : 200, json: async () => daten };
  };
  return aufrufe;
}

test('EAA-Nutzerschlüssel findet mehrere Instagram-Konten über Facebook-Seiten', async () => {
  falscheSchnittstelle([
    ['/me/accounts', { data: [
      { name: 'Wetter', access_token: 'EAAseite1', instagram_business_account: { id: '111', username: 'wetter' } },
      { name: 'Ohne IG', access_token: 'EAAseite2' },
      { name: 'Kommste', access_token: 'EAAseite3', instagram_business_account: { id: '222', username: 'kommste' } },
    ] }],
  ]);
  const konten = await instagram.schluesselPruefen('EAA' + 'x'.repeat(50));
  assert.deepStrictEqual(konten.map((k) => [k.igUserId, k.username, k.token]), [['111', 'wetter', 'EAAseite1'], ['222', 'kommste', 'EAAseite3']]);
  assert.ok(konten[0].ablauf > Date.now() + 365 * 86400000);
});

test('EAA-Schlüssel direkt für ein Instagram-Konto', async () => {
  falscheSchnittstelle([['graph.facebook.com/v23.0/me?fields=id%2Cusername', { id: '333', username: 'wetter' }]]);
  const konten = await instagram.schluesselPruefen('EAA' + 'y'.repeat(50));
  assert.deepStrictEqual(konten.map((k) => [k.igUserId, k.username]), [['333', 'wetter']]);
});

test('Posten mit EAA-Schlüssel läuft über graph.facebook.com', async () => {
  const aufrufe = falscheSchnittstelle([
    ['/333/media_publish', { id: 'post1' }],
    ['/333/media', { id: 'beh1' }],
    ['/beh1?', { status_code: 'FINISHED' }],
    ['/post1?', { permalink: 'https://instagram.com/p/x' }],
  ]);
  const r = await instagram.veroeffentlichen({ ig_user_id: '333', token: 'EAAabc' }, { media_type: 'IMAGE', caption: 'Hallo' }, 'https://x/m/1.jpg');
  assert.strictEqual(r.mediaId, 'post1');
  assert.ok(aufrufe.every((a) => a.url.startsWith('https://graph.facebook.com/')));
});

test('EAA-Schlüssel ohne Instagram-Konto gibt eine verständliche Meldung', async () => {
  falscheSchnittstelle([['/me/accounts', { data: [] }]]);
  await assert.rejects(instagram.schluesselPruefen('EAA' + 'z'.repeat(50)), /kein Instagram-Konto erreichbar/);
});
