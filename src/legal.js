'use strict';
// VORLAGEN. Vor dem Verkauf bitte von einer Fachperson (Anwalt, IHK, Rechtstexte-Dienst) prüfen lassen.
const config = require('./config');
const { e } = require('./views');

const i = config.impressum;
const name = config.appName;

function impressum() {
  return `<h1>Impressum</h1>
<p>Angaben gemäß § 5 DDG</p>
<p>${e(i.name)}<br>${e(i.adresse)}</p>
<p>E-Mail: ${e(i.email)}${i.telefon ? `<br>Telefon: ${e(i.telefon)}` : ''}</p>
${i.ustid ? `<p>Umsatzsteuer-ID: ${e(i.ustid)}</p>` : ''}
<p>Verantwortlich für den Inhalt: ${e(i.name)}, Anschrift wie oben.</p>
<h2>Streitbeilegung</h2>
<p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`;
}

function datenschutz() {
  return `<h1>Datenschutzerklärung</h1>
<p class="klein">Vorlage, bitte vor dem Start prüfen lassen.</p>
<h2>1. Verantwortlicher</h2>
<p>${e(i.name)}, ${e(i.adresse)}, ${e(i.email)}</p>
<h2>2. Welche Daten wir verarbeiten</h2>
<ul>
<li><b>Konto:</b> E-Mail-Adresse und Passwort (nur verschlüsselt gespeichert), um dir den Dienst bereitzustellen (Art. 6 Abs. 1 lit. b DSGVO).</li>
<li><b>Instagram:</b> Wenn du dein Konto verbindest, speichern wir deinen Instagram-Benutzernamen, deine Instagram-Konto-ID und einen Zugangsschlüssel. Damit veröffentlichen wir ausschließlich die Beiträge, die du selbst planst. Wir lesen keine Nachrichten und keine Follower-Daten.</li>
<li><b>Inhalte:</b> Hochgeladene Videos, Bilder und Texte, bis sie veröffentlicht sind. Dateien werden 14 Tage nach der Veröffentlichung automatisch gelöscht.</li>
<li><b>Zahlung:</b> Die Bezahlung läuft über Stripe Payments Europe Ltd., Irland. Kartendaten sehen wir nicht. Datenschutz bei Stripe: stripe.com/de/privacy.</li>
<li><b>Server-Protokolle:</b> Technisch notwendige Zugriffsdaten (IP-Adresse, Zeitpunkt) für höchstens 7 Tage zur Sicherheit (Art. 6 Abs. 1 lit. f DSGVO).</li>
</ul>
<h2>3. Weitergabe</h2>
<p>Deine Inhalte geben wir nur an Instagram (Meta Platforms Ireland Ltd.) weiter, und zwar genau dann, wenn du sie zur Veröffentlichung planst. Unser Server steht in der EU. Wir verkaufen keine Daten und nutzen keine Werbe-Tracker.</p>
<h2>4. Cookies</h2>
<p>Wir setzen nur ein technisch notwendiges Cookie, damit du angemeldet bleibst.</p>
<h2>5. Speicherdauer und Löschung</h2>
<p>Du kannst dein Konto jederzeit unter „Profil“ selbst löschen. Dann löschen wir alle Daten sofort, außer solche, die wir aus steuerlichen Gründen aufbewahren müssen (Rechnungen, 10 Jahre). Wenn du ${e(name)} in den Instagram-Einstellungen entfernst, löschen wir die Verbindung ebenfalls.</p>
<h2>6. Deine Rechte</h2>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Schreib uns einfach an ${e(i.email)}.</p>`;
}

function agb() {
  return `<h1>Allgemeine Geschäftsbedingungen</h1>
<p class="klein">Vorlage, bitte vor dem Start prüfen lassen.</p>
<h2>1. Leistung</h2>
<p>${e(name)} ist ein Online-Dienst zum Planen und automatischen Veröffentlichen von Beiträgen auf Instagram-Business- und Creator-Konten. Die Veröffentlichung erfolgt über die offizielle Schnittstelle von Meta. Für Ausfälle oder Änderungen dieser Schnittstelle können wir nicht garantieren.</p>
<h2>2. Gratis-Version und Preis</h2>
<p>Die Gratis-Version ist dauerhaft kostenlos und auf ${config.freeAccounts} Instagram-Konto und ${config.freePosts} Beiträge pro Kalendermonat begrenzt. Premium kostet ${e(name)} ${e(config.priceLabel)} pro Monat inkl. gesetzlicher MwSt. (sofern ausgewiesen) und hebt diese Grenzen auf. Die Zahlung erfolgt monatlich im Voraus über Stripe.</p>
<h2>3. Laufzeit und Kündigung</h2>
<p>Das Abo läuft jeweils einen Monat und verlängert sich automatisch. Du kannst jederzeit zum Ende des laufenden Monats kündigen, direkt unter „Abo“.</p>
<h2>4. Deine Inhalte</h2>
<p>Du bist für deine Inhalte verantwortlich und musst die Rechte daran besitzen. Inhalte, die gegen Gesetze oder die Instagram-Richtlinien verstoßen, sind nicht erlaubt.</p>
<h2>5. Widerrufsrecht für Verbraucher</h2>
<p>Du kannst den Vertrag innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen. Die Frist beginnt mit Vertragsschluss. Zum Widerruf genügt eine E-Mail an ${e(i.email)}. Hast du verlangt, dass die Leistung während der Widerrufsfrist beginnt, zahlst du für die bis zum Widerruf erbrachte Leistung anteilig.</p>
<h2>6. Haftung</h2>
<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im Übrigen haften wir nur für die Verletzung wesentlicher Vertragspflichten, begrenzt auf den vorhersehbaren, vertragstypischen Schaden.</p>
<h2>7. Schlussbestimmungen</h2>
<p>Es gilt deutsches Recht. Zwingende Verbraucherschutzvorschriften des Landes, in dem du wohnst, bleiben unberührt.</p>`;
}

module.exports = { impressum, datenschutz, agb };
