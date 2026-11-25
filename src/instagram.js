'use strict';
// Anbindung an die "Instagram API mit Instagram-Login" von Meta.
// Funktioniert mit Instagram-Business- und Creator-Konten (keine Facebook-Seite nötig).
const crypto = require('node:crypto');
const config = require('./config');

const GRAPH = () => `https://graph.instagram.com/${config.graphVersion}`;
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

// Konto über einen Zugangsschlüssel aus dem Meta-Dashboard hinzufügen (ohne Weiterleitung)
async function schluesselPruefen(token) {
  const ich = await anfrage(`${GRAPH()}/me?` + new URLSearchParams({ fields: 'user_id,username', access_token: token }));
  let neu = { token, ablauf: Date.now() + 50 * 86400000 };
  try { neu = await zugangVerlaengern(token); } catch { /* frischer Schlüssel lässt sich erst nach 24 h verlängern */ }
  return { igUserId: String(ich.user_id || ich.id), username: ich.username, token: neu.token, ablauf: neu.ablauf };
}

// 60-Tage-Zugang verlängern (geht, solange er noch gültig und mind. 24 h alt ist)
async function zugangVerlaengern(token) {
  const d = await anfrage('https://graph.instagram.com/refresh_access_token?' + new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  }));
  return { token: d.access_token, ablauf: Date.now() + Number(d.expires_in || 5184000) * 1000 };
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Beitrag veröffentlichen. mediaUrl muss öffentlich erreichbar sein.
async function veroeffentlichen(konto, beitrag, mediaUrl) {
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
  const behaelter = await anfrage(`${GRAPH()}/${konto.ig_user_id}/media`, formular(felder));

  // Warten, bis Instagram das Medium verarbeitet hat (max. 10 Minuten)
  let status = '';
  for (let i = 0; i < 60; i++) {
    const s = await anfrage(`${GRAPH()}/${behaelter.id}?` + new URLSearchParams({
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

  const post = await anfrage(`${GRAPH()}/${konto.ig_user_id}/media_publish`, formular({
    creation_id: behaelter.id, access_token: konto.token,
  }));
  let permalink = '';
  try {
    permalink = (await anfrage(`${GRAPH()}/${post.id}?` + new URLSearchParams({
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
