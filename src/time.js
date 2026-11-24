'use strict';
const TZ = 'Europe/Berlin';

const teileFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Teile (Jahr, Monat, ...) eines Zeitpunkts in deutscher Zeit
function teile(ms) {
  const t = {};
  for (const p of teileFormat.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') t[p.type] = Number(p.value);
  }
  return t;
}

// Abstand deutscher Zeit zu UTC in Millisekunden
function versatz(ms) {
  const t = teile(ms);
  const alsUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  return alsUtc - Math.floor(ms / 1000) * 1000;
}

// "2026-11-24T18:30" (deutsche Zeit) -> UTC-Millisekunden
function berlinZuUtc(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(text || '').trim());
  if (!m) return null;
  const roh = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = roh - versatz(roh);
  utc = roh - versatz(utc);
  return utc;
}

const zwei = (n) => String(n).padStart(2, '0');

// UTC-Millisekunden -> "2026-11-24T18:30" für <input type="datetime-local">
function fuerEingabe(ms) {
  const t = teile(ms);
  return `${t.year}-${zwei(t.month)}-${zwei(t.day)}T${zwei(t.hour)}:${zwei(t.minute)}`;
}

function datumText(ms) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ms)) + ' Uhr';
}

function uhrzeit(ms) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

module.exports = { teile, berlinZuUtc, fuerEingabe, datumText, uhrzeit, TZ };
