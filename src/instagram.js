'use strict';
// Anbindung an die Instagram-Schnittstelle von Meta, entweder über den Instagram-Login
// (IG-Schlüssel, keine Facebook-Seite nötig) oder über Facebook Login for Business / Unified Login
// (EAA-Schlüssel, Instagram-Konto muss mit einer Facebook-Seite verknüpft sein).
const crypto = require('node:crypto');
const config = require('./config');

const GRAPH = () => `https://graph.instagram.com/${config.graphVersion}`;
const FB_GRAPH = () => `https://graph.facebook.com/${config.graphVersion}`;
// Schlüssel aus Facebook Login for Business ("Unified Login") beginnen mit EAA,
// Schlüssel aus dem Instagram-Login mit IG. Die Veröffentlichungs-Schnittstelle ist bei beiden gleich.
const istFacebook = (token) => /^EAA/.test(String(token || ''));
const graphFuer = (token) => (istFacebook(token) ? FB_GRAPH() : GRAPH());
const NIE = () => Date.now() + 10 * 365 * 86400000; // Seiten-Schlüssel laufen nicht ab
const SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];
const redirectUri = () => `${config.baseUrl}/instagram/callback`;

class InstagramFehler extends Error {
  constructor(text, endgueltig = false) {
    super(text);
    this.endgueltig = endgueltig; // true = erneut versuchen bringt nichts
  }
}

async function anfrage(url, optionen = {}) {
  let antwort;
  try {
    antwort = await fetch(url, { ...optionen, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw new InstagramFehler('Instagram ist gerade nicht erreichbar: ' + e.message);
  }
  let daten = {};
  try { daten = await antwort.json(); } catch { /* keine JSON-Antwort */ }
  if (!antwort.ok || daten.error) {
    const f = daten.error || {};
    const text = f.error_user_msg || f.message || daten.error_message || `HTTP ${antwort.status}`;
    // Code 190 = Zugang abgelaufen/entzogen, 10/200 = fehlende Rechte
    const endgueltig = [190, 10, 200].includes(f.code) || antwort.status === 400;
    throw new InstagramFehler(`${text}${f.code ? ` (Code ${f.code})` : ''}`, endgueltig);
  }
  return daten;
}

function formular(felder) {
  return { method: 'POST', body: new URLSearchParams(felder) };
}

function loginUrl(state) {
  const p = new URLSearchParams({
    enable_fb_login: '0',
    force_authentication: '1',
    client_id: config.igAppId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

// Code aus dem Login gegen einen 60-Tage-Zugang tauschen und Konto-Infos holen
async function codeEinloesen(code) {
  code = String(code).replace(/#_$/, '');
  const kurz = await anfrage('https://api.instagram.com/oauth/access_token', formular({
    client_id: config.igAppId,
    client_secret: config.igAppSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(),
    code,
  }));
  const kurzToken = kurz.access_token || (kurz.data && kurz.data[0] && kurz.data[0].access_token);
  if (!kurzToken) throw new InstagramFehler('Instagram hat keinen Zugang zurückgegeben.');

  const lang = await anfrage('https://graph.instagram.com/access_token?' + new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: config.igAppSecret,
    access_token: kurzToken,
  }));
  const ich = await anfrage(`${GRAPH()}/me?` + new URLSearchParams({
    fields: 'user_id,username,account_type',
    access_token: lang.access_token,
  }));
  return {
    igUserId: String(ich.user_id || ich.id),
    username: ich.username,
    token: lang.access_token,
    ablauf: Date.now() + Number(lang.expires_in || 5184000) * 1000,
  };
}

// Konten über einen Zugangsschlüssel aus dem Meta-Dashboard hinzufügen (ohne Weiterleitung).
// Gibt eine Liste zurück: Ein Facebook-Schlüssel kann mehrere Instagram-Konten auf einmal freischalten.
async function schluesselPruefen(token) {
  if (istFacebook(token)) return facebookSchluesselPruefen(token);
  const ich = await anfrage(`${GRAPH()}/me?` + new URLSearchParams({ fields: 'user_id,username', access_token: token }));
  let neu = { token, ablauf: Date.now() + 50 * 86400000 };
  try { neu = await zugangVerlaengern(token); } catch { /* frischer Schlüssel lässt sich erst nach 24 h verlängern */ }
  return [{ igUserId: String(ich.user_id || ich.id), username: ich.username, token: neu.token, ablauf: neu.ablauf }];
}

async function facebookSchluesselPruefen(token) {
  // Kurzlebigen Nutzer-Schlüssel (1-2 h) gegen einen langlebigen tauschen, wenn App-ID und Geheimcode bekannt sind.
  // Seiten-Schlüssel, die aus einem langlebigen Nutzer-Schlüssel kommen, laufen nicht ab.
  let nutzerToken = token;
  if (config.igAppId && config.igAppSecret) {
    try {
      const lang = await anfrage(`${FB_GRAPH()}/oauth/access_token?` + new URLSearchParams({
        grant_type: 'fb_exchange_token', client_id: config.igAppId, client_secret: config.igAppSecret, fb_exchange_token: token,
      }));
      if (lang.access_token) nutzerToken = lang.access_token;
    } catch { /* z. B. schon ein Seiten-Schlüssel */ }
  }
  const felder = 'instagram_business_account{id,username}';
  const zuKonto = (id, username, t) => ({ igUserId: String(id), username, token: t, ablauf: NIE() });
  let konten = [];
  const versuche = [
    // 1. Nutzer-Schlüssel: Facebook-Seiten mit verknüpftem Instagram-Konto
    async () => {
      const d = await anfrage(`${FB_GRAPH()}/me/accounts?` + new URLSearchParams({
        fields: `name,access_token,${felder}`, limit: '100', access_token: nutzerToken,
      }));
      return (d.data || []).filter((s) => s.instagram_business_account)
        .map((s) => zuKonto(s.instagram_business_account.id, s.instagram_business_account.username || s.name, s.access_token || nutzerToken));
    },
    // 2. Schlüssel gehört direkt zu einem Instagram-Konto (Unified Login / Systemnutzer mit Instagram-Asset)
    async () => {
      const ich = await anfrage(`${FB_GRAPH()}/me?` + new URLSearchParams({ fields: 'id,username', access_token: token }));
      return ich.username ? [zuKonto(ich.id, ich.username, token)] : [];
    },
    // 3. Seiten-Schlüssel: /me ist die Seite
    async () => {
      const seite = await anfrage(`${FB_GRAPH()}/me?` + new URLSearchParams({ fields: `name,${felder}`, access_token: token }));
      const ig = seite.instagram_business_account;
      return ig ? [zuKonto(ig.id, ig.username || seite.name, token)] : [];
    },
    // 4. Systemnutzer: zugewiesene Instagram-Konten
    async () => {
      const d = await anfrage(`${FB_GRAPH()}/me/instagram_accounts?` + new URLSearchParams({ fields: 'id,username', access_token: token }));
      return (d.data || []).filter((k) => k.username).map((k) => zuKonto(k.id, k.username, token));
    },
  ];
  let letzterFehler = null;
  for (const v of versuche) {
    try { konten = await v(); } catch (e) { letzterFehler = e; }
    if (konten.length) break;
  }
  if (!konten.length && letzterFehler && letzterFehler.message.includes('(Code 190)')) throw letzterFehler;
  if (!konten.length) {
    throw new InstagramFehler('Mit diesem Schlüssel ist kein Instagram-Konto erreichbar. Das Instagram-Konto muss ein Business- oder Creator-Konto sein, mit einer Facebook-Seite verknüpft, und beim Erstellen des Schlüssels freigegeben werden.', true);
  }
  return konten;
}

// 60-Tage-Zugang verlängern (geht, solange er noch gültig und mind. 24 h alt ist)
async function zugangVerlaengern(token) {
  if (istFacebook(token)) return { token, ablauf: NIE() };
  const d = await anfrage('https://graph.instagram.com/refresh_access_token?' + new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  }));
  return { token: d.access_token, ablauf: Date.now() + Number(d.expires_in || 5184000) * 1000 };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Beitrag veröffentlichen. mediaUrl muss öffentlich erreichbar sein.
async function veroeffentlichen(konto, beitrag, mediaUrl) {
  const G = graphFuer(konto.token);
  const felder = { access_token: konto.token };
  const video = beitrag.media_type === 'REELS';
  if (beitrag.als_story) {
    // Storys haben keine Bildunterschrift
    felder.media_type = 'STORIES';
    felder[video ? 'video_url' : 'image_url'] = mediaUrl;
  } else if (video) {
    felder.caption = beitrag.caption || '';
    felder.media_type = 'REELS';
    felder.video_url = mediaUrl;
    felder.share_to_feed = 'true';
  } else {
    felder.caption = beitrag.caption || '';
    felder.image_url = mediaUrl;
  }
  const behaelter = await anfrage(`${G}/${konto.ig_user_id}/media`, formular(felder));

  // Warten, bis Instagram das Medium verarbeitet hat (max. 10 Minuten)
  let status = '';
  for (let i = 0; i < 60; i++) {
    const s = await anfrage(`${G}/${behaelter.id}?` + new URLSearchParams({
      fields: 'status_code,status', access_token: konto.token,
    }));
    status = s.status_code;
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new InstagramFehler(`Instagram konnte das Medium nicht verarbeiten: ${s.status || status}`, true);
    }
    await warte(beitrag.media_type === 'REELS' ? 10000 : 3000);
  }
  if (status !== 'FINISHED') throw new InstagramFehler(`Instagram ist nach 10 Minuten nicht fertig (Status: ${status}).`);

  const post = await anfrage(`${G}/${konto.ig_user_id}/media_publish`, formular({
    creation_id: behaelter.id, access_token: konto.token,
  }));
  let permalink = '';
  try {
    permalink = (await anfrage(`${G}/${post.id}?` + new URLSearchParams({
      fields: 'permalink', access_token: konto.token,
    }))).permalink || '';
  } catch { /* Link ist nur Komfort */ }
  return { mediaId: post.id, permalink };
}

// "signed_request" aus den Meta-Rückrufen (Abmelden / Daten löschen) prüfen
function signedRequestLesen(signed) {
  const [sig, nutzlast] = String(signed || '').split('.');
  if (!sig || !nutzlast) return null;
  const soll = crypto.createHmac('sha256', config.igAppSecret).update(nutzlast).digest();
  const ist = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (ist.length !== soll.length || !crypto.timingSafeEqual(ist, soll)) return null;
  try {
    return JSON.parse(Buffer.from(nutzlast.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = {
  loginUrl, codeEinloesen, schluesselPruefen, zugangVerlaengern, veroeffentlichen, signedRequestLesen, InstagramFehler,
};
