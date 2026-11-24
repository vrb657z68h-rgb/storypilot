'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(config.dataDir, 'storypilot.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    pw_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    trial_ends INTEGER NOT NULL,
    sub_status TEXT,
    stripe_customer TEXT,
    stripe_sub TEXT,
    period_end INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ig_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    token TEXT,
    token_expires INTEGER,
    demo INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, ig_user_id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,          -- REELS (Video) oder IMAGE (Bild)
    als_story INTEGER NOT NULL DEFAULT 0, -- 1 = als Story posten
    file TEXT,                          -- Dateiname im uploads-Ordner
    public_key TEXT NOT NULL UNIQUE,    -- zufälliger Schlüssel für die Medien-URL
    caption TEXT NOT NULL DEFAULT '',
    scheduled_at INTEGER NOT NULL,      -- UTC in Millisekunden
    status TEXT NOT NULL DEFAULT 'geplant', -- geplant | laeuft | gepostet | fehler
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    permalink TEXT,
    started_at INTEGER,
    posted_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_due ON posts (status, scheduled_at);
  CREATE INDEX IF NOT EXISTS posts_user ON posts (user_id, scheduled_at);

  CREATE TABLE IF NOT EXISTS einstellungen (
    schluessel TEXT PRIMARY KEY,
    wert TEXT
  );
`);

db.einstellung = (k) => (db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(k) || {}).wert;
db.einstellungSetzen = (k, v) => db.prepare(`INSERT INTO einstellungen (schluessel, wert) VALUES (?, ?)
  ON CONFLICT (schluessel) DO UPDATE SET wert = excluded.wert`).run(k, v);

module.exports = db;
