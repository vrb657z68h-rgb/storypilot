#!/bin/bash
# Richtet Storypilot auf einem frischen Ubuntu-Server ein (z. B. Hetzner Cloud).
# Wird automatisch von cloud-init.yaml aufgerufen. Optional: DOMAIN und ERSTER_CODE vorher setzen.
set -euo pipefail
cd /opt/storypilot

# Öffentliche IP herausfinden und daraus eine Adresse mit HTTPS machen (sslip.io, kostenlos)
IP=$(curl -fsS http://169.254.169.254/hetzner/v1/metadata/public-ipv4 2>/dev/null || curl -fsS https://api.ipify.org)
DOMAIN=${DOMAIN:-$(echo "$IP" | tr . -).sslip.io}

if [ ! -f .env ]; then
  cat > .env <<ENV
BASE_URL=https://$DOMAIN
MODUS=nur-ich
ERSTER_CODE=${ERSTER_CODE:-}
SESSION_SECRET=$(openssl rand -hex 32)
ENV
fi

cat > Caddyfile <<CADDY
$DOMAIN {
	request_body {
		max_size 310MB
	}
	reverse_proxy app:3000
}
CADDY

mkdir -p data && chown 1000:1000 data
docker compose up -d --build
echo "Storypilot läuft auf https://$DOMAIN"
