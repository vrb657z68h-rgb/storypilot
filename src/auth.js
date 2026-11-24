'use strict';
const crypto = require('node:crypto');
const db = require('./db');
const config = require('./config');

const SESSION_TAGE = 30;
const COOKIE = 'sp_sess';

function hashPasswort(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function pruefePasswort(pw, gespeichert) {
  const [art, saltHex, hashHex] = String(gespeichert).split('$');
  if (art !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const soll = Buffer.from(hashHex, 'hex');
  return soll.length === hash.length && crypto.timingSafeEqual(soll, hash);
}

function cookiesLesen(req) {
  const aus = {};
  for (const teil of String(req.headers.cookie || '').split(';')) {
    const i = teil.indexOf('=');
    if (i > 0) {
      try { aus[teil.slice(0, i).trim()] = decodeURIComponent(teil.slice(i + 1).trim()); } catch { /* ungültig */ }
    }
  }
  return aus;
}

function sessionStarten(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const ablauf = Date.now() + SESSION_TAGE * 86400000;
  db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(token, userId, ablauf);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TAGE * 86400}${config.secureCookies ? '; Secure' : ''}`);
}

function sessionBeenden(req, res) {
  const token = cookiesLesen(req)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Middleware: req.user und req.csrf setzen
function laden(req, res, next) {
  const token = cookiesLesen(req)[COOKIE];
  req.user = null;
  req.csrf = '';
  if (token) {
    const zeile = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                              WHERE s.token = ? AND s.expires > ?`).get(token, Date.now());
    if (zeile) {
      req.user = zeile;
      req.csrf = crypto.createHmac('sha256', config.sessionSecret).update('csrf:' + token).digest('hex');
    }
  }
  next();
}

function csrfOk(req) {
  const gesendet = String((req.body && req.body._csrf) || '');
  if (!req.csrf || gesendet.length !== req.csrf.length) return false;
  return crypto.timingSafeEqual(Buffer.from(gesendet), Buffer.from(req.csrf));
}

function nurAngemeldet(req, res, next) {
  if (!req.user) return res.redirect('/anmelden');
  next();
}

// Einfacher Schutz gegen zu viele Anmeldeversuche
const versuche = new Map();
function zuVieleVersuche(ip) {
  const jetzt = Date.now();
  const liste = (versuche.get(ip) || []).filter((t) => jetzt - t < 15 * 60000);
  liste.push(jetzt);
  versuche.set(ip, liste);
  return liste.length > 10;
}

function aufraeumen() {
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  db.prepare('DELETE FROM oauth_states WHERE expires < ?').run(Date.now());
  const grenze = Date.now() - 15 * 60000;
  for (const [ip, liste] of versuche) {
    if (!liste.some((t) => t > grenze)) versuche.delete(ip);
  }
}

module.exports = {
  hashPasswort, pruefePasswort, sessionStarten, sessionBeenden, laden, csrfOk,
  nurAngemeldet, zuVieleVersuche, aufraeumen,
};
