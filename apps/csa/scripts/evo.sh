#!/usr/bin/env bash
# Consulta a Evolution API da VM. A chave nunca sai de lá: o curl roda dentro do SSH e só o
# resultado volta. Host e chave vêm do deploy.env, então não há nada para preencher à mão.
#
# Primeiro argumento pode ser o método (GET/POST/PUT/DELETE); sem ele, GET — ou POST se houver
# corpo. A Evolution mistura os três: connect é GET, logout é DELETE, webhook/set é POST.
#
#   bash scripts/evo.sh instance/fetchInstances
#   bash scripts/evo.sh instance/connectionState/pedidos-csa
#   bash scripts/evo.sh 'instance/connect/pedidos-csa?number=5583999998888'
#   bash scripts/evo.sh DELETE instance/logout/pedidos-csa
#   bash scripts/evo.sh webhook/set/pedidos-csa '{"webhook":{"enabled":true}}'   # com corpo = POST
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f deploy.env ]] || { echo "Erro: apps/csa/deploy.env não encontrado."; exit 1; }
# shellcheck source=deploy.env
source deploy.env

VERBO=""
case "${1:-}" in
  GET|POST|PUT|DELETE|PATCH) VERBO="$1"; shift ;;
esac
ROTA="${1:?uso: evo.sh [METODO] <rota-da-api> [json-do-corpo]}"
CORPO="${2:-}"

ssh -i "$SSH_KEY" "$VM_USER@$VM_HOST" bash -s -- "$ROTA" "$CORPO" "$VERBO" <<'REMOTO'
rota="$1"; corpo="$2"; verbo="$3"
chave="$(sudo grep '^EVOLUTION_API_KEY' /opt/pedidos-csa/.env.production | cut -d= -f2- | tr -d "\"' ")"
if [[ -z "$chave" ]]; then echo "Erro: EVOLUTION_API_KEY não encontrada no .env.production da VM"; exit 1; fi
[[ -z "$verbo" ]] && { [[ -n "$corpo" ]] && verbo=POST || verbo=GET; }
# -w com o status: a evolution responde corpo vazio em alguns erros, e sem o código não dá
# para distinguir "deu certo e não devolveu nada" de "recusou em silêncio".
if [[ -n "$corpo" ]]; then
  curl -s -w '\n[HTTP %{http_code}]\n' -X "$verbo" -H "apikey: $chave" -H 'Content-Type: application/json' -d "$corpo" "localhost:8080/$rota"
else
  curl -s -w '\n[HTTP %{http_code}]\n' -X "$verbo" -H "apikey: $chave" "localhost:8080/$rota"
fi
echo
REMOTO
