#!/usr/bin/env bash
# Consulta a Evolution API da VM. A chave nunca sai de lá: o curl roda dentro do SSH e só o
# resultado volta. Host e chave vêm do deploy.env, então não há nada para preencher à mão.
#
#   bash scripts/evo.sh instance/fetchInstances
#   bash scripts/evo.sh instance/connectionState/pedidos-csa
#   bash scripts/evo.sh 'instance/connect/pedidos-csa?number=5583999998888'
#   bash scripts/evo.sh webhook/set/pedidos-csa '{"webhook":{"enabled":true}}'   # com corpo = POST
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f deploy.env ]] || { echo "Erro: apps/csa/deploy.env não encontrado."; exit 1; }
# shellcheck source=deploy.env
source deploy.env

ROTA="${1:?uso: evo.sh <rota-da-api> [json-do-corpo]}"
CORPO="${2:-}"

ssh -i "$SSH_KEY" "$VM_USER@$VM_HOST" bash -s -- "$ROTA" "$CORPO" <<'REMOTO'
rota="$1"; corpo="$2"
chave="$(sudo grep '^EVOLUTION_API_KEY' /opt/pedidos-csa/.env.production | cut -d= -f2- | tr -d "\"' ")"
if [[ -z "$chave" ]]; then echo "Erro: EVOLUTION_API_KEY não encontrada no .env.production da VM"; exit 1; fi
if [[ -n "$corpo" ]]; then
  curl -s -X POST -H "apikey: $chave" -H 'Content-Type: application/json' -d "$corpo" "localhost:8080/$rota"
else
  curl -s -H "apikey: $chave" "localhost:8080/$rota"
fi
echo
REMOTO
