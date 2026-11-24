'use strict';
// Schlanke Stripe-Anbindung ohne zusätzliche Bibliothek.
const crypto = require('node:crypto');
const config = require('./config');
const db = require('./db');

async function stripe(pfad, felder, methode = 'POST') {
  const url = `https://api.stripe.com/v1/${pfad}`;
  const antwort = await fetch(methode === 'GET' && felder ? `${url}?${new URLSearchParams(felder)}` : url, {
    method: methode,
    headers: {
      Authorization: `Bearer ${config.stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: methode === 'POST' && felder ? new URLSearchParams(felder) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const daten = await antwort.json();
  if (!antwort.ok) throw new Error((daten.error && daten.error.message) || `Stripe-Fehler ${antwort.status}`);
  return daten;
}

async function kaufLink(user) {
  const felder = {
    mode: 'subscription',
    'line_items[0][price]': config.stripePrice,
    'line_items[0][quantity]': '1',
    success_url: `${config.baseUrl}/app/abo?ok=1`,
    cancel_url: `${config.baseUrl}/app/abo`,
    client_reference_id: String(user.id),
    allow_promotion_codes: 'true',
    locale: 'de',
    'automatic_tax[enabled]': 'false',
  };
  if (user.stripe_customer) felder.customer = user.stripe_customer;
  else felder.customer_email = user.email;
  const sitzung = await stripe('checkout/sessions', felder);
  return sitzung.url;
}

async function verwaltenLink(user) {
  const sitzung = await stripe('billing_portal/sessions', {
    customer: user.stripe_customer,
    return_url: `${config.baseUrl}/app/abo`,
  });
  return sitzung.url;
}

// Signatur des Webhooks prüfen (Header "Stripe-Signature")
function webhookPruefen(rohText, kopf) {
  const teile = {};
  for (const stueck of String(kopf || '').split(',')) {
    const [k, v] = stueck.split('=');
    if (k === 'v1') (teile.v1 = teile.v1 || []).push(v);
    else if (k) teile[k] = v;
  }
  if (!teile.t || !teile.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(teile.t)) > 300) return false;
  const soll = crypto.createHmac('sha256', config.stripeWebhookSecret).update(`${teile.t}.${rohText}`).digest('hex');
  return teile.v1.some((v) => v.length === soll.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(soll)));
}

function aboSpeichern(abo) {
  const ende = abo.current_period_end
    || (abo.items && abo.items.data && abo.items.data[0] && abo.items.data[0].current_period_end) || null;
  db.prepare(`UPDATE users SET sub_status = ?, stripe_sub = ?, period_end = ?
              WHERE stripe_customer = ?`).run(abo.status, abo.id, ende ? ende * 1000 : null, abo.customer);
}

async function ereignisVerarbeiten(ereignis) {
  const o = ereignis.data.object;
  switch (ereignis.type) {
    case 'checkout.session.completed': {
      const userId = Number(o.client_reference_id);
      if (!userId || !o.customer) return;
      db.prepare('UPDATE users SET stripe_customer = ?, stripe_sub = ? WHERE id = ?').run(o.customer, o.subscription, userId);
      if (o.subscription) aboSpeichern(await stripe(`subscriptions/${o.subscription}`, null, 'GET'));
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      aboSpeichern(o);
      break;
    default:
      break;
  }
}

module.exports = { kaufLink, verwaltenLink, webhookPruefen, ereignisVerarbeiten };
