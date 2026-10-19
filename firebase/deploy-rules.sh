#!/usr/bin/env bash
# Publica firebase/*.rules no projeto do app. Uso: bash firebase/deploy-rules.sh <csa|fermentou> [production|development]
# Requer `npx firebase-tools login` uma vez (interativo).
set -euo pipefail
cd "$(dirname "$0")/.."
app=${1:?app: csa ou fermentou}; amb=${2:-production}
env="apps/$app/.env.$amb"
projeto=$(grep -E '^FIREBASE_PROJECT_ID=' "$env" | cut -d= -f2 | tr -d '"')
[ -n "$projeto" ] || { echo "FIREBASE_PROJECT_ID vazio em $env"; exit 1; }
echo "Publicando regras em $projeto"
npx -y firebase-tools deploy --only firestore:rules,storage --project "$projeto"
