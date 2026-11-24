'use strict';
const config = require('./config');
const zeit = require('./time');

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const art = (b) => (b.als_story ? 'Story' : b.media_type === 'REELS' ? 'Reel' : 'Bild');
const symbol = (b) => (b.als_story ? '⭕' : b.media_type === 'REELS' ? '🎬' : '🖼');

const STATUS = {
  geplant: ['Geplant', 'blau'],
  laeuft: ['Wird gepostet …', 'gelb'],
  gepostet: ['Gepostet', 'gruen'],
  fehler: ['Fehler', 'rot'],
};

function seite(req, titel, inhalt, { schmal = false } = {}) {
  const u = req.user;
  const nav = u
    ? `<a href="/app">Kalender</a><a href="/app/neu" class="knopf klein">+ Neuer Beitrag</a>
       <a href="/app/konten">Konten</a><a href="/app/abo">Abo</a><a href="/app/konto">Profil</a>`
    : config.nurIch ? '' : `<a href="/#preis">Preis</a><a href="/anmelden">Anmelden</a><a href="/registrieren" class="knopf klein">Kostenlos starten</a>`;
  const hinweis = req.query && req.query.hinweis ? `<div class="hinweis">${e(req.query.hinweis)}</div>` : '';
  const demo = config.demoInstagram && u
    ? '<div class="demo-leiste">Demo-Modus: Es wird nichts wirklich auf Instagram gepostet.</div>' : '';
  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(titel)} · ${e(config.appName)}</title>
<link rel="stylesheet" href="/static/style.css">
<script src="/static/app.js" defer></script>
<link rel="icon" href="/static/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/icon-180.png">
<link rel="manifest" href="/static/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${e(config.appName)}">
<meta name="theme-color" content="#2b4eff">
</head><body>
${demo}
<header class="kopf"><a href="${u ? '/app' : '/'}" class="logo"><img src="/static/icon.svg" alt="">${e(config.appName)}</a>
<nav>${nav}</nav></header>
<main class="${schmal ? 'schmal' : ''}">${hinweis}${inhalt}</main>
<footer><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/agb">AGB</a></footer>
</body></html>`;
}

const csrf = (req) => `<input type="hidden" name="_csrf" value="${e(req.csrf)}">`;

function startseite(req) {
  return seite(req, 'Instagram-Beiträge automatisch planen', `
<section class="held">
  <h1>Plane Reels und Storys.<br><span>Wir posten pünktlich.</span></h1>
  <p>Lade Reels, Bilder und Storys hoch, wähle Text und Uhrzeit, fertig. ${e(config.appName)} veröffentlicht sie automatisch auf Instagram, auch wenn dein Handy aus ist.</p>
  <a class="knopf gross" href="/registrieren">Kostenlos starten</a>
</section>
<section class="vorteile">
  <div><b>📅 Kalender</b><p>Alle geplanten Beiträge auf einen Blick, Tag für Tag.</p></div>
  <div><b>🎬 Reels, Bilder, Storys</b><p>Video oder Foto hochladen, Text dazu, Uhrzeit wählen.</p></div>
  <div><b>⏰ Pünktlich</b><p>Unser Server postet rund um die Uhr. Du musst nichts anlassen.</p></div>
  <div><b>🇪🇺 Datenschutz</b><p>Server in der EU, keine Werbung, kein Weiterverkauf deiner Daten.</p></div>
</section>
<section class="preis" id="preis">
  <h2>Einfache Preise</h2>
  <div class="preise">
  <div class="preiskarte hell">
    <div class="planname">Gratis</div>
    <div class="betrag">0 €<small> / Monat</small></div>
    <ul><li>${config.freePosts} Beiträge pro Monat</li><li>${config.freeAccounts} Instagram-Konto</li><li>Reels, Bilder und Storys</li><li>Für immer kostenlos</li></ul>
    <a class="knopf hell" href="/registrieren">Kostenlos starten</a>
  </div>
  <div class="preiskarte">
    <div class="planname">Premium</div>
    <div class="betrag">${e(config.priceLabel)}<small> / Monat</small></div>
    <ul><li>Unbegrenzt Beiträge planen</li><li>Mehrere Instagram-Konten</li><li>Reels, Bilder und Storys</li><li>Monatlich kündbar</li></ul>
    <a class="knopf" href="/registrieren">Jetzt starten</a>
  </div>
  </div>
</section>`);
}

function formularSeite(req, titel, felder, knopf, fehler, unten = '') {
  return seite(req, titel, `
<div class="karte"><h1>${e(titel)}</h1>
${fehler ? `<div class="fehler">${e(fehler)}</div>` : ''}
<form method="post">${csrf(req)}${felder}<button class="knopf breit">${e(knopf)}</button></form>
${unten}</div>`, { schmal: true });
}

function registrieren(req, fehler, email = '') {
  const code = config.nurIch && config.ersterCode
    ? `<label>Einrichtungs-Code<input name="code" required autocomplete="off" value="${e((req.body && req.body.code) || (req.query && req.query.code) || '')}"></label>` : '';
  return formularSeite(req, 'Konto erstellen', `${code}
<label>E-Mail<input type="email" name="email" required value="${e(email)}" autocomplete="email"></label>
<label>Passwort (mind. 8 Zeichen)<input type="password" name="passwort" required minlength="8" autocomplete="new-password"></label>
${config.nurIch ? '<input type="hidden" name="agb" value="1">' : `<label class="haken"><input type="checkbox" name="agb" value="1" required> Ich akzeptiere die <a href="/agb" target="_blank">AGB</a> und habe die <a href="/datenschutz" target="_blank">Datenschutzerklärung</a> gelesen.</label>`}`,
  'Konto erstellen', fehler, config.nurIch ? '<p class="klein">Privater Modus: Nur dieses eine Konto kann angelegt werden.</p>' : '<p class="klein">Schon dabei? <a href="/anmelden">Anmelden</a></p>');
}

function anmelden(req, fehler, email = '') {
  return formularSeite(req, 'Anmelden', `
<label>E-Mail<input type="email" name="email" required value="${e(email)}" autocomplete="email"></label>
<label>Passwort<input type="password" name="passwort" required autocomplete="current-password"></label>`,
  'Anmelden', fehler, config.nurIch ? '' : '<p class="klein">Neu hier? <a href="/registrieren">Konto erstellen</a></p>');
}

function statusMarke(b) {
  const [text, farbe] = STATUS[b.status] || [b.status, 'blau'];
  return `<span class="marke ${farbe}">${text}</span>`;
}

function beitragZeile(req, b) {
  const aktionen = [];
  if (b.status === 'geplant') {
    aktionen.push(`<a href="/app/beitrag/${b.id}">Bearbeiten</a>`);
  }
  if (b.status === 'fehler') {
    aktionen.push(`<a href="/app/beitrag/${b.id}">Neu planen</a>`);
  }
  if (b.status !== 'laeuft') {
    aktionen.push(`<form method="post" action="/app/beitrag/${b.id}/loeschen" data-bestaetigen="Beitrag wirklich löschen?">${csrf(req)}<button class="link">Löschen</button></form>`);
  }
  if (b.permalink) aktionen.push(`<a href="${e(b.permalink)}" target="_blank" rel="noopener">Auf Instagram ansehen</a>`);
  const vorschau = b.file
    ? (b.media_type === 'REELS'
      ? `<video src="/app/datei/${b.id}" muted preload="metadata"></video>`
      : `<img src="/app/datei/${b.id}" alt="">`)
    : '<div class="leer-vorschau">🎬</div>';
  return `<div class="beitrag">
  <div class="vorschau">${vorschau}</div>
  <div class="infos">
    <div class="zeile1"><b>${e(zeit.datumText(b.scheduled_at))}</b> ${statusMarke(b)}</div>
    <div class="klein">@${e(b.username)} · ${art(b)}</div>
    <div class="text">${e((b.caption || '').slice(0, 140))}${(b.caption || '').length > 140 ? ' …' : ''}</div>
    ${b.error ? `<div class="fehlertext">${e(b.error)}</div>` : ''}
    <div class="aktionen">${aktionen.join('')}</div>
  </div></div>`;
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function kalender(req, { jahr, monat, beitraege, kommende, konten, premium, imMonat }) {
  const erster = new Date(Date.UTC(jahr, monat - 1, 1));
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const startLuecke = (erster.getUTCDay() + 6) % 7; // Montag zuerst
  const heute = zeit.teile(Date.now());
  const proTag = {};
  for (const b of beitraege) {
    const t = zeit.teile(b.scheduled_at);
    (proTag[t.day] = proTag[t.day] || []).push(b);
  }
  let zellen = '';
  for (let i = 0; i < startLuecke; i++) zellen += '<div class="tag aus"></div>';
  for (let d = 1; d <= tageImMonat; d++) {
    const istHeute = heute.year === jahr && heute.month === monat && heute.day === d;
    const eintraege = (proTag[d] || []).map((b) => {
      const farbe = (STATUS[b.status] || [])[1] || 'blau';
      return `<a class="eintrag ${farbe}" href="/app/beitrag/${b.id}" title="${e(b.caption)}">${zeit.uhrzeit(b.scheduled_at)} ${symbol(b)} @${e(b.username)}</a>`;
    }).join('');
    const neu = `/app/neu?datum=${jahr}-${String(monat).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    zellen += `<div class="tag${istHeute ? ' heute' : ''}"><a class="nr" href="${neu}" title="Beitrag an diesem Tag planen">${d}</a>${eintraege}</div>`;
  }
  const vor = monat === 12 ? `${jahr + 1}-01` : `${jahr}-${String(monat + 1).padStart(2, '0')}`;
  const zurueck = monat === 1 ? `${jahr - 1}-12` : `${jahr}-${String(monat - 1).padStart(2, '0')}`;

  let warnung = '';
  if (!konten.length) warnung = '<div class="hinweis">Verbinde zuerst dein Instagram-Konto: <a href="/app/konten">Konto verbinden</a></div>';
  else if (!premium) warnung = `<div class="hinweis">Gratis-Version: ${imMonat} von ${config.freePosts} Beiträgen in diesem Monat geplant. <a href="/app/abo">Unbegrenzt mit Premium</a></div>`;

  return seite(req, 'Kalender', `${warnung}
<div class="kal-kopf"><a href="/app?m=${zurueck}" class="knopf hell">‹</a><h1>${MONATE[monat - 1]} ${jahr}</h1><a href="/app?m=${vor}" class="knopf hell">›</a></div>
<div class="kalender">
  <div class="wt">Mo</div><div class="wt">Di</div><div class="wt">Mi</div><div class="wt">Do</div><div class="wt">Fr</div><div class="wt">Sa</div><div class="wt">So</div>
  ${zellen}
</div>
<h2>Als Nächstes</h2>
${kommende.length ? kommende.map((b) => beitragZeile(req, b)).join('') : '<p class="leer">Noch nichts geplant. <a href="/app/neu">Ersten Beitrag planen</a></p>'}`);
}

function beitragFormular(req, { konten, beitrag, fehler, werte = {} }) {
  const b = beitrag || {};
  const neu = !beitrag;
  const kontoWahl = konten.map((k) => `<option value="${k.id}" ${String(werte.konto || b.account_id) === String(k.id) ? 'selected' : ''}>@${e(k.username)}${k.demo ? ' (Demo)' : ''}</option>`).join('');
  const zeitpunkt = werte.zeit || (b.scheduled_at ? zeit.fuerEingabe(b.scheduled_at) : '');
  const text = werte.text ?? b.caption ?? '';
  return seite(req, neu ? 'Neuer Beitrag' : 'Beitrag bearbeiten', `
<div class="karte"><h1>${neu ? 'Neuer Beitrag' : 'Beitrag bearbeiten'}</h1>
${fehler ? `<div class="fehler">${e(fehler)}</div>` : ''}
${!konten.length ? '<div class="hinweis">Du hast noch kein Instagram-Konto verbunden. <a href="/app/konten">Jetzt verbinden</a></div>' : ''}
<form method="post" enctype="multipart/form-data" action="${neu ? '/app/neu' : `/app/beitrag/${b.id}`}">${csrf(req)}
${neu ? `<label>Video (MP4/MOV, max. ${config.maxVideoMB} MB) oder Bild (JPG, max. ${config.maxImageMB} MB)
  <input type="file" name="datei" accept="video/mp4,video/quicktime,image/jpeg" required></label>`
    : `<div class="vorschau gross">${b.file ? (b.media_type === 'REELS' ? `<video src="/app/datei/${b.id}" controls></video>` : `<img src="/app/datei/${b.id}" alt="">`) : ''}</div>`}
<label>Instagram-Konto<select name="konto" required>${kontoWahl}</select></label>
<label>Posten als<select name="art" id="art">
  <option value="beitrag">Reel bzw. Bild im Feed</option>
  <option value="story" ${(werte.art || (b.als_story ? 'story' : '')) === 'story' ? 'selected' : ''}>Story (24 Stunden sichtbar, ohne Text)</option>
</select></label>
<label>Datum und Uhrzeit (deutsche Zeit)<input type="datetime-local" name="zeit" required value="${e(zeitpunkt)}"></label>
<label id="textfeld">Text (Bildunterschrift, max. 2.200 Zeichen, max. 30 Hashtags)
  <textarea name="text" rows="7" maxlength="2200" id="text">${e(text)}</textarea></label>
<div class="klein" id="zaehler"></div>
<p class="klein" id="storyhinweis" hidden>Storys werden ohne Text gepostet. Schreib den Text am besten direkt ins Bild oder Video.</p>
<button class="knopf breit">${neu ? 'Beitrag planen' : 'Speichern und neu planen'}</button>
</form></div>
`, { schmal: true });
}

function konten(req, liste, einrichten = false) {
  const zeilen = liste.map((k) => `<div class="konto">
  <div><b>@${e(k.username)}</b>${k.demo ? ' <span class="marke gelb">Demo</span>' : ''}
  ${!k.demo && k.token_expires ? `<div class="klein">Zugang gültig bis ${e(zeit.datumText(k.token_expires))} (wird automatisch verlängert)</div>` : ''}</div>
  <form method="post" action="/app/konten/${k.id}/trennen" data-bestaetigen="Konto trennen? Geplante Beiträge für dieses Konto werden gelöscht.">${csrf(req)}<button class="link rot">Trennen</button></form>
</div>`).join('');
  const verbinden = config.demoInstagram && einrichten
    ? `<a class="knopf" href="/app/einrichtung">Instagram einrichten</a>
       <p class="klein">Einmalig nötig: Trag die Zugangsdaten deiner Meta-App ein. Bis dahin kannst du alles mit einem Demo-Konto ausprobieren.</p>
       <form method="post" action="/app/konten/demo">${csrf(req)}<button class="link">Demo-Konto zum Ausprobieren verbinden</button></form>`
    : config.demoInstagram
    ? `<form method="post" action="/app/konten/demo">${csrf(req)}<button class="knopf">Demo-Konto verbinden</button></form>
       <p class="klein">Im Demo-Modus wird das Posten nur simuliert. Für echtes Posten müssen INSTAGRAM_APP_ID und INSTAGRAM_APP_SECRET eingetragen sein.</p>`
    : `<a class="knopf" href="/instagram/verbinden">Instagram-Konto verbinden</a>`;
  return seite(req, 'Konten', `
<div class="karte"><h1>Instagram-Konten</h1>
${zeilen || '<p class="leer">Noch kein Konto verbunden.</p>'}
<div class="abstand">${verbinden}</div>
<p class="klein">Wichtig: Es funktionieren nur Instagram-<b>Business</b>- oder <b>Creator</b>-Konten. Umstellen kannst du das kostenlos in der Instagram-App unter Einstellungen → Kontotyp und Tools.</p>
</div>`, { schmal: true });
}

function abo(req, { premium, imMonat }) {
  const u = req.user;
  let inhalt;
  if (!config.billingEnabled) {
    inhalt = '<p>Die Bezahlung ist noch nicht eingerichtet (Stripe-Schlüssel fehlt). Bis dahin ist alles freigeschaltet.</p>';
  } else if (u.sub_status === 'active' || u.sub_status === 'trialing') {
    inhalt = `<p>Dein Premium-Abo ist <span class="marke gruen">aktiv</span>${u.period_end ? `, nächste Abrechnung am ${e(zeit.datumText(u.period_end).replace(/,? \d\d:\d\d Uhr$/, ''))}` : ''}.</p>
<form method="post" action="/app/abo/verwalten">${csrf(req)}<button class="knopf hell">Zahlung und Kündigung verwalten</button></form>`;
  } else {
    inhalt = `<p>Du nutzt die <b>Gratis-Version</b>: ${imMonat} von ${config.freePosts} Beiträgen in diesem Monat, ${config.freeAccounts} Instagram-Konto.</p>
<div class="preiskarte"><div class="planname">Premium</div><div class="betrag">${e(config.priceLabel)}<small> / Monat</small></div>
<ul><li>Unbegrenzt Beiträge planen</li><li>Mehrere Instagram-Konten</li></ul><p class="klein">Monatlich kündbar. Bezahlung sicher über Stripe.</p>
<form method="post" action="/app/abo/kaufen">${csrf(req)}<button class="knopf breit">Premium holen</button></form></div>
${u.stripe_customer ? `<form method="post" action="/app/abo/verwalten">${csrf(req)}<button class="link">Rechnungen ansehen</button></form>` : ''}`;
  }
  return seite(req, 'Abo', `<div class="karte"><h1>Dein Abo</h1>${req.query.ok ? '<div class="hinweis">Danke! Dein Abo wird gerade aktiviert.</div>' : ''}${inhalt}</div>`, { schmal: true });
}

function profil(req) {
  return seite(req, 'Profil', `
<div class="karte"><h1>Profil</h1>
<p>Angemeldet als <b>${e(req.user.email)}</b></p>
<form method="post" action="/abmelden">${csrf(req)}<button class="knopf hell">Abmelden</button></form>
<h2 class="abstand">Konto löschen</h2>
<p class="klein">Löscht dein Konto, alle verbundenen Instagram-Zugänge, geplanten Beiträge und hochgeladenen Dateien. Ein laufendes Abo kündige bitte vorher unter „Abo“.</p>
<form method="post" action="/app/konto/loeschen" data-bestaetigen="Wirklich alles endgültig löschen?">${csrf(req)}<button class="knopf rot">Konto endgültig löschen</button></form>
</div>`, { schmal: true });
}

function einrichtung(req, fehler) {
  const basis = config.baseUrl;
  const zeile = (titel, wert) => `<label>${titel}<input readonly value="${e(wert)}" class="kopieren"></label>`;
  return seite(req, 'Instagram einrichten', `
<div class="karte text-seite"><h1>Instagram einrichten</h1>
${fehler ? `<div class="fehler">${e(fehler)}</div>` : ''}
<p>Das machst du nur einmal, am besten am Computer.</p>
<ol>
<li>Öffne <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> und lege eine neue App an (Anwendungsfall „Andere“, Typ „Business“). Wenn du schon eine App für die Reels-Automatik hast, kannst du auch die nehmen.</li>
<li>Füge das Produkt <b>Instagram</b> hinzu und wähle <b>„API-Einrichtung mit Instagram-Login“</b>.</li>
<li>Unter „Instagram-Business-Login einrichten“ trägst du diese Adressen ein (zum Kopieren antippen):
${zeile('Weiterleitungs-URL (OAuth)', `${basis}/instagram/callback`)}
${zeile('Deautorisierungs-Rückruf', `${basis}/instagram/deauthorize`)}
${zeile('Rückruf für Datenlöschung', `${basis}/instagram/datenloeschung`)}</li>
<li>Unter „App-Rollen → Rollen“ trägst du dein Instagram-Konto als <b>Instagram-Tester</b> ein. Die Einladung bestätigst du in der Instagram-App unter Einstellungen → Website-Berechtigungen → App-Einladungen.</li>
<li>Kopiere die <b>Instagram-App-ID</b> und den <b>Instagram-App-Geheimcode</b> (stehen oben auf der Instagram-Seite der App) hierher:</li>
</ol>
<form method="post">${csrf(req)}
<label>Instagram-App-ID<input name="app_id" inputmode="numeric" required value="${e(config.igAppId)}"></label>
<label>Instagram-App-Geheimcode${config.igAppSecret ? ' (gespeichert, nur zum Ändern ausfüllen)' : ''}<input name="app_secret" type="password" ${config.igAppSecret ? '' : 'required'} autocomplete="off"></label>
<button class="knopf breit">Speichern</button>
</form>
<p class="klein">Solange die Meta-App im Entwicklungsmodus ist, kann sie nur auf Konten posten, die als Tester eingetragen sind. Für dich allein reicht das, eine Prüfung durch Meta ist nicht nötig.</p>
</div>`, { schmal: true });
}

function text(req, titel, html) {
  return seite(req, titel, `<div class="karte text-seite">${html}</div>`, { schmal: true });
}

function fehlerSeite(req, titel, nachricht) {
  return seite(req, titel, `<div class="karte"><h1>${e(titel)}</h1><p>${e(nachricht)}</p><a class="knopf" href="${req.user ? '/app' : '/'}">Zurück</a></div>`, { schmal: true });
}

module.exports = {
  e, startseite, registrieren, anmelden, kalender, beitragFormular, konten, einrichtung, abo, profil, text, fehlerSeite,
};
