'use strict';
// Läuft im Hintergrund: postet fällige Beiträge und verlängert Instagram-Zugänge.
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const config = require('./config');
const instagram = require('./instagram');
const auth = require('./auth');
const plan = require('./plan');

const MAX_VERSUCHE = 3;
const WIEDERHOLEN_NACH = 5 * 60000;
let laeuft = false;

function medienUrl(beitrag) {
  return `${config.baseUrl}/m/${beitrag.public_key}${path.extname(beitrag.file || '')}`;
}

async function einenPosten(beitrag) {
  const konto = db.prepare('SELECT * FROM accounts WHERE id = ?').get(beitrag.account_id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(beitrag.user_id);
  if (!konto || !user) return;

  if (!plan.postenErlaubt(user, beitrag)) {
    db.prepare(`UPDATE posts SET status = 'fehler', error = ? WHERE id = ?`)
      .run(`Gratis-Limit von ${config.freePosts} Beiträgen in diesem Monat erreicht. Mit Premium geht es weiter.`, beitrag.id);
    return;
  }

  db.prepare(`UPDATE posts SET status = 'laeuft', started_at = ?, attempts = attempts + 1 WHERE id = ?`)
    .run(Date.now(), beitrag.id);

  try {
    let ergebnis;
    if (konto.demo) {
      await new Promise((r) => setTimeout(r, 500));
      ergebnis = { permalink: '' };
    } else {
      ergebnis = await instagram.veroeffentlichen(konto, beitrag, medienUrl(beitrag));
    }
    db.prepare(`UPDATE posts SET status = 'gepostet', posted_at = ?, permalink = ?, error = NULL WHERE id = ?`)
      .run(Date.now(), ergebnis.permalink || null, beitrag.id);
  } catch (e) {
    const versuche = beitrag.attempts + 1;
    const nochmal = !e.endgueltig && versuche < MAX_VERSUCHE;
    db.prepare(`UPDATE posts SET status = ?, error = ?, scheduled_at = ? WHERE id = ?`).run(
      nochmal ? 'geplant' : 'fehler',
      String(e.message || e).slice(0, 500),
      nochmal ? Date.now() + WIEDERHOLEN_NACH : beitrag.scheduled_at,
      beitrag.id,
    );
  }
}

async function zugaengeVerlaengern() {
  // Zugänge, die in weniger als 10 Tagen ablaufen und älter als 1 Tag sind
  const konten = db.prepare(`SELECT * FROM accounts WHERE demo = 0 AND token_expires < ? AND created_at < ?`)
    .all(Date.now() + 10 * 86400000, Date.now() - 86400000);
  for (const k of konten) {
    try {
      const neu = await instagram.zugangVerlaengern(k.token);
      db.prepare('UPDATE accounts SET token = ?, token_expires = ? WHERE id = ?').run(neu.token, neu.ablauf, k.id);
    } catch (e) {
      console.error(`Zugang für @${k.username} konnte nicht verlängert werden: ${e.message}`);
    }
  }
}

function alteDateienLoeschen() {
  // Medien gesendeter Beiträge nach 14 Tagen löschen (spart Speicher)
  const alt = db.prepare(`SELECT id, file FROM posts WHERE status = 'gepostet' AND file IS NOT NULL AND posted_at < ?`)
    .all(Date.now() - 14 * 86400000);
  for (const b of alt) {
    try { fs.unlinkSync(path.join(config.dataDir, 'uploads', b.file)); } catch { /* schon weg */ }
    db.prepare('UPDATE posts SET file = NULL WHERE id = ?').run(b.id);
  }
}

async function takt() {
  if (laeuft) return;
  laeuft = true;
  try {
    // Beiträge, die beim letzten Neustart mittendrin waren, nicht doppelt posten
    db.prepare(`UPDATE posts SET status = 'fehler', error = 'Unterbrochen. Bitte auf Instagram prüfen und ggf. erneut planen.'
                WHERE status = 'laeuft' AND started_at < ?`).run(Date.now() - 20 * 60000);

    const faellig = db.prepare(`SELECT * FROM posts WHERE status = 'geplant' AND scheduled_at <= ?
                                ORDER BY scheduled_at LIMIT 20`).all(Date.now());
    // Mehrere Konten gleichzeitig, aber jedes Konto der Reihe nach
    const proKonto = new Map();
    for (const b of faellig) {
      if (!proKonto.has(b.account_id)) proKonto.set(b.account_id, []);
      proKonto.get(b.account_id).push(b);
    }
    await Promise.all([...proKonto.values()].map(async (liste) => {
      for (const b of liste) await einenPosten(b);
    }));
  } catch (e) {
    console.error('Fehler im Planer:', e);
  } finally {
    laeuft = false;
  }
}

function starten() {
  setInterval(takt, 30000).unref();
  setInterval(async () => {
    auth.aufraeumen();
    alteDateienLoeschen();
    await zugaengeVerlaengern();
  }, 60 * 60000).unref();
  setTimeout(takt, 2000).unref();
}

module.exports = { starten, takt, medienUrl };
