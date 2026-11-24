'use strict';
// Kleiner HTTP-Client mit Cookies für die Tests
function client(app) {
  let server; let basis; let cookie = '';
  return {
    async start() { await new Promise((ok) => { server = app.listen(0, ok); }); basis = `http://127.0.0.1:${server.address().port}`; },
    stop() { server.close(); },
    abmelden() { cookie = ''; },
    async holen(pfad, optionen = {}) {
      const r = await fetch(basis + pfad, { redirect: 'manual', ...optionen, headers: { cookie, ...(optionen.headers || {}) } });
      for (const c of r.headers.getSetCookie()) {
        const [paar] = c.split(';');
        const [name] = paar.split('=');
        cookie = cookie.split('; ').filter((x) => x && !x.startsWith(name + '=')).concat(paar).join('; ');
      }
      return { status: r.status, ort: r.headers.get('location'), text: await r.text() };
    },
  };
}
const csrfAus = (html) => (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];

async function registrieren(c, email) {
  const r = await c.holen('/registrieren');
  return c.holen('/registrieren', { method: 'POST', body: new URLSearchParams({ _csrf: csrfAus(r.text), email, passwort: 'geheim123', agb: '1' }) });
}

async function demoKonto(c) {
  const r = await c.holen('/app/konten');
  return c.holen('/app/konten/demo', { method: 'POST', body: new URLSearchParams({ _csrf: csrfAus(r.text) }) });
}

async function planen(c, { zeitText, text = 'Test', typ = 'video/mp4', name = 'reel.mp4', art = 'beitrag' }) {
  const r = await c.holen('/app/neu');
  const fd = new FormData();
  fd.append('_csrf', csrfAus(r.text));
  fd.append('konto', r.text.match(/<option value="(\d+)"/)[1]);
  fd.append('art', art);
  fd.append('zeit', zeitText);
  fd.append('text', text);
  fd.append('datei', new Blob([Buffer.alloc(500)], { type: typ }), name);
  return c.holen('/app/neu', { method: 'POST', body: fd });
}

module.exports = { client, csrfAus, registrieren, demoKonto, planen };
