'use strict';
// Gratis-Version und Premium-Abo
const config = require('./config');
const db = require('./db');
const zeit = require('./time');

function istPremium(user) {
  if (!config.billingEnabled) return true;
  return user.sub_status === 'active' || user.sub_status === 'trialing';
}

// Anfang und Ende des Kalendermonats (deutsche Zeit), in dem ms liegt
function monatsGrenzen(ms) {
  const t = zeit.teile(ms);
  const zwei = (n) => String(n).padStart(2, '0');
  const von = zeit.berlinZuUtc(`${t.year}-${zwei(t.month)}-01T00:00`);
  const bis = t.month === 12
    ? zeit.berlinZuUtc(`${t.year + 1}-01-01T00:00`)
    : zeit.berlinZuUtc(`${t.year}-${zwei(t.month + 1)}-01T00:00`);
  return [von, bis];
}

function beitraegeImMonat(userId, ms, ohneId = 0, nurGepostet = false) {
  const [von, bis] = monatsGrenzen(ms);
  return db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND id != ? AND scheduled_at >= ? AND scheduled_at < ?
                     AND ${nurGepostet ? "status = 'gepostet'" : "status != 'fehler'"}`).get(userId, ohneId, von, bis).n;
}

// Fehlertext, wenn das Planen nicht erlaubt ist, sonst null
function planenPruefen(user, wann, ohneId = 0) {
  if (istPremium(user)) return null;
  if (beitraegeImMonat(user.id, wann, ohneId) >= config.freePosts) {
    return `Mit der Gratis-Version kannst du ${config.freePosts} Beiträge pro Monat planen. Für unbegrenzt viele hol dir Premium für ${config.priceLabel} im Monat.`;
  }
  return null;
}

function kontoPruefen(user) {
  if (istPremium(user)) return null;
  const n = db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?').get(user.id).n;
  if (n >= config.freeAccounts) {
    return `Mit der Gratis-Version kannst du ${config.freeAccounts} Instagram-Konto verbinden. Für mehrere Konten hol dir Premium.`;
  }
  return null;
}

// Beim Posten: Gratis-Limit auch nach einer Kündigung einhalten
function postenErlaubt(user, beitrag) {
  if (istPremium(user)) return true;
  return beitraegeImMonat(user.id, beitrag.scheduled_at, beitrag.id, true) < config.freePosts;
}

module.exports = { istPremium, planenPruefen, kontoPruefen, postenErlaubt, beitraegeImMonat };
