'use strict';
const path = require('node:path');
const fs = require('node:fs');

// .env-Datei laden, falls vorhanden
const envDatei = path.join(__dirname, '..', '.env');
if (fs.existsSync(envDatei) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envDatei);
}

const e = process.env;
const BASE_URL = (e.BASE_URL || `http://localhost:${e.PORT || 3000}`).replace(/\/$/, '');

const config = {
  port: Number(e.PORT || 3000),
  baseUrl: BASE_URL,
  secureCookies: BASE_URL.startsWith('https://'),
  dataDir: path.resolve(e.DATA_DIR || path.join(__dirname, '..', 'data')),
  sessionSecret: e.SESSION_SECRET || 'bitte-in-.env-aendern',

  // Instagram API mit Instagram-Login (Meta-App)
  igAppId: e.INSTAGRAM_APP_ID || '',
  igAppSecret: e.INSTAGRAM_APP_SECRET || '',
  graphVersion: e.GRAPH_VERSION || 'v23.0',

  // Stripe
  stripeKey: e.STRIPE_SECRET_KEY || '',
  stripePrice: e.STRIPE_PRICE_ID || '',
  stripeWebhookSecret: e.STRIPE_WEBHOOK_SECRET || '',

  // Produkt
  appName: e.APP_NAME || 'Storypilot',
  priceLabel: e.PRICE_LABEL || '9,99 €',
  freePosts: Number(e.FREE_POSTS || 10),      // Gratis: Beiträge pro Monat
  freeAccounts: Number(e.FREE_ACCOUNTS || 1), // Gratis: Instagram-Konten
  // 'nur-ich' = nur das erste Konto darf sich registrieren (private Nutzung)
  nurIch: (e.MODUS || '') === 'nur-ich',
  timeZone: 'Europe/Berlin',
  maxVideoMB: 300,
  maxImageMB: 8,

  // Impressum
  impressum: {
    name: e.IMPRESSUM_NAME || '[Vor- und Nachname]',
    adresse: e.IMPRESSUM_ADRESSE || '[Straße Hausnummer, PLZ Ort]',
    email: e.IMPRESSUM_EMAIL || '[E-Mail-Adresse]',
    telefon: e.IMPRESSUM_TELEFON || '',
    ustid: e.IMPRESSUM_USTID || '',
  },
};

// Ohne Meta-Zugangsdaten läuft Storypilot im Demo-Modus (Posten wird nur simuliert)
config.demoInstagram = !config.igAppId || !config.igAppSecret;
// Ohne Stripe-Schlüssel ist alles freigeschaltet (zum Testen)
config.billingEnabled = Boolean(config.stripeKey && config.stripePrice);

module.exports = config;
