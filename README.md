# Storypilot

Storypilot ist eine Web-App, mit der man Instagram-Reels, Bilder und Storys plant und automatisch posten lässt. Der Server postet zur geplanten Zeit, auch wenn das Handy aus ist.

- **Gratis-Version:** 10 Beiträge pro Monat, 1 Instagram-Konto
- **Premium:** 9,99 € im Monat, unbegrenzt viele Beiträge und mehrere Konten

Alle Grenzen und Preise lassen sich in der `.env` ändern.

## Was die App kann

- Registrieren und anmelden mit E-Mail und Passwort
- Instagram-Business- oder Creator-Konto verbinden (offizieller Instagram-Login von Meta)
- Reel (MP4/MOV), Bild (JPG) oder Story hochladen, Text schreiben, Datum und Uhrzeit wählen
- Monatskalender und Liste der nächsten Beiträge, Bearbeiten und Löschen
- Automatisches Posten mit bis zu 3 Versuchen und klarer Fehlermeldung
- Instagram-Zugänge werden automatisch verlängert (sie gelten 60 Tage)
- Abo-Bezahlung und Kündigung über Stripe
- Impressum, Datenschutz und AGB als **Vorlagen** (vor dem Verkauf prüfen lassen)
- Konto selbst löschen und die Rückrufe von Meta zur Datenlöschung
- Hochgeladene Dateien werden 14 Tage nach dem Posten gelöscht

## Ausprobieren auf dem eigenen Rechner (Demo-Modus)

Voraussetzung ist Node.js 22.13 oder neuer.

```bash
npm install
npm start
```

Dann öffnest du http://localhost:3000. Ohne Meta-Zugangsdaten läuft die App im **Demo-Modus**: Du kannst ein Demo-Konto verbinden, und das Posten wird nur simuliert.

Die Tests startest du mit `npm test`.

## In Betrieb nehmen

### 1. Server

Ein kleiner Server in Deutschland reicht für den Anfang, zum Beispiel Hetzner Cloud CX22 (etwa 5 € im Monat). Darauf installierst du Docker, dann:

```bash
git clone <repository> storypilot && cd storypilot
cp .env.example .env        # ausfüllen
mkdir data && sudo chown 1000 data
# in "Caddyfile" deine Domain eintragen
docker compose up -d --build
```

Die Domain muss per DNS-Eintrag (A-Record) auf die IP des Servers zeigen. Caddy holt das HTTPS-Zertifikat dann automatisch.

### 2. Meta-App (für echtes Posten)

1. Auf developers.facebook.com eine App vom Typ „Business“ anlegen.
2. Das Produkt **Instagram** hinzufügen und dort „API-Einrichtung mit Instagram-Login“ wählen.
3. Als Weiterleitungs-URL `https://DEINE-DOMAIN/instagram/callback` eintragen.
4. Rückruf für die Deautorisierung: `https://DEINE-DOMAIN/instagram/deauthorize`
5. Rückruf für Anfragen zur Datenlöschung: `https://DEINE-DOMAIN/instagram/datenloeschung`
6. Die Instagram-App-ID und den App-Geheimcode in `.env` als `INSTAGRAM_APP_ID` und `INSTAGRAM_APP_SECRET` eintragen.
7. Für fremde Konten braucht die App den **Advanced Access** für `instagram_business_basic` und `instagram_business_content_publish`. Dafür verlangt Meta eine App-Prüfung mit Screencast und die Unternehmensverifizierung (Gewerbe nötig). Bis dahin funktioniert das Posten nur für Konten, die in der App als Tester eingetragen sind.

### 3. Stripe (für die Bezahlung)

1. Konto bei stripe.com anlegen und ein Produkt „Storypilot Premium“ mit einem monatlichen Preis von 9,99 € erstellen.
2. Die Preis-ID (`price_...`) als `STRIPE_PRICE_ID` und den geheimen Schlüssel (`sk_live_...`) als `STRIPE_SECRET_KEY` eintragen.
3. Einen Webhook auf `https://DEINE-DOMAIN/stripe/webhook` anlegen. Ereignisse: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Das Signatur-Geheimnis (`whsec_...`) als `STRIPE_WEBHOOK_SECRET` eintragen.
4. Im Stripe-Dashboard das Kundenportal aktivieren, damit Kunden selbst kündigen können.

## Gut zu wissen

- Instagram erlaubt über die Schnittstelle höchstens 100 Beiträge pro Konto in 24 Stunden.
- Bilder müssen JPG sein, Reels MP4 oder MOV (am besten 9:16, 5 bis 90 Sekunden).
- Storys haben über die Schnittstelle keine Bildunterschrift und keine Sticker.
- Die Daten liegen in `data/` (SQLite-Datenbank und hochgeladene Dateien). Diesen Ordner regelmäßig sichern.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/server.js` | Alle Seiten und Formulare |
| `src/scheduler.js` | Postet fällige Beiträge alle 30 Sekunden |
| `src/instagram.js` | Anbindung an die Instagram-Schnittstelle |
| `src/stripe.js` | Abo-Bezahlung |
| `src/plan.js` | Gratis-Version und Premium |
| `src/views.js` | HTML der Seiten |
| `src/legal.js` | Impressum, Datenschutz, AGB (Vorlagen) |
| `public/` | Design (CSS), Logo, kleines Skript |
