#!/bin/bash
# Holt die neueste Version und startet Storypilot neu. Deine Daten bleiben erhalten.
set -euo pipefail
cd /opt/storypilot
git pull --ff-only
docker compose up -d --build
