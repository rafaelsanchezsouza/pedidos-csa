#!/usr/bin/env bash
set -euo pipefail

# Deploy do ambiente de DEV hospedado da CSA.
#
# Mesma VM da produção, isolado por porta — padrão já usado aí pelo `nativa-dev` (8190) e pelo
# Fermentou (8092): mesmo `server_name`, mesmo certificado Let's Encrypt, porta própria. Sem
# DNS e sem certbot; em troca, a porta precisa estar aberta na Security List da Oracle.
#
#   bash deploy-dev.sh                # build + deploy
#   bash deploy-dev.sh --skip-build   # só reenvia o que já está buildado
#
# Diferenças que importam em relação ao deploy.sh:
#   - roda com NODE_ENV=development, então o env.ts carrega `.env.development` (Firebase de dev)
#   - PORT é forçado para não colidir com a produção: o `.env.development` diz 3001, que na VM
#     é a porta da produção. O dotenv NÃO sobrescreve variável já existente no ambiente, então
#     o PORT do pm2 vence o do arquivo.
#   - cron fica desligado (CRON_ENABLED=false). O Firebase é separado, mas o WhatsApp e o
#     GitHub são OS MESMOS da produção: um job rodando aqui mandaria mensagem de verdade.
if [[ ! -f deploy.env ]]; then
  echo "Erro: arquivo deploy.env não encontrado."; exit 1
fi
# shellcheck source=deploy.env
source deploy.env

# Sobrepõe o que é do ambiente de dev; VM_USER/VM_HOST/SSH_KEY vêm do deploy.env (é a mesma VM,
# e um segundo arquivo de segredo só criaria duas cópias para manter em sincronia).
VM_DIR="/opt/pedidos-csa-dev"
ENV_FILE=".env.development"
PM2_NAME="pedidos-csa-dev"
PORT_DEV="3051"

[[ -f "$ENV_FILE" ]] || { echo "Erro: $ENV_FILE não encontrado."; exit 1; }

SSH="ssh -i $SSH_KEY $VM_USER@$VM_HOST"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CORE_TGZ_PACK="pedidos-core-0.1.0.tgz"
CORE_TGZ="pedidos-core-$(date +%Y%m%d%H%M%S).tgz"

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "==> [1/6] Build local (core primeiro; front em modo development)..."
  npm --prefix "$RAIZ" run build -w @pedidos/core
  npm run typecheck
  # --mode development: é o que faz o Vite ler as VITE_* do .env.development. Buildar em
  # produção aqui apontaria o front do ambiente de dev para o Firebase de PRODUÇÃO.
  npx vite build --mode development
  npm run build:backend
else
  echo "==> [1/6] Build ignorado (--skip-build)"
fi

echo "==> [2/6] Empacotando @pedidos/core..."
rm -f pedidos-core-*.tgz
npm pack "$RAIZ/packages/core" --pack-destination "$PWD" > /dev/null
test -f "$CORE_TGZ_PACK" || { echo "Erro: $CORE_TGZ_PACK não foi gerado"; exit 1; }
mv "$CORE_TGZ_PACK" "$CORE_TGZ"

node -e "
  const p = require('./package.json');
  p.dependencies['@pedidos/core'] = 'file:./$CORE_TGZ';
  delete p.devDependencies;
  require('fs').writeFileSync('package.deploy.json', JSON.stringify(p, null, 2));
"

echo "==> [3/6] Copiando artefatos..."
# Primeira subida: /opt exige sudo para criar, e a pasta passa a ser do usuário do deploy.
$SSH "[ -d $VM_DIR ] || { sudo mkdir -p $VM_DIR && sudo chown $VM_USER:$VM_USER $VM_DIR; }"
$SSH "rm -rf $VM_DIR/dist $VM_DIR/dist-server $VM_DIR/package-lock.json \
  $VM_DIR/pedidos-core-*.tgz $VM_DIR/node_modules/@pedidos/core"
scp -i "$SSH_KEY" -r dist/        "$VM_USER@$VM_HOST:$VM_DIR/dist"
scp -i "$SSH_KEY" -r dist-server/ "$VM_USER@$VM_HOST:$VM_DIR/dist-server"
scp -i "$SSH_KEY" "$CORE_TGZ"     "$VM_USER@$VM_HOST:$VM_DIR/$CORE_TGZ"
scp -i "$SSH_KEY" package.deploy.json "$VM_USER@$VM_HOST:$VM_DIR/package.json"
# Com NODE_ENV=development o env.ts procura `.env.development` — copiar com esse nome.
scp -i "$SSH_KEY" "$ENV_FILE" "$VM_USER@$VM_HOST:$VM_DIR/.env.development"
rm -f package.deploy.json

echo "==> [4/6] Permissões do env..."
$SSH "chmod 600 $VM_DIR/.env.development"

echo "==> [5/6] Instalando dependências..."
$SSH "cd $VM_DIR && npm install --omit=dev --no-audit --no-fund"

echo "==> [6/6] Subindo no pm2 (NODE_ENV=development, cron desligado)..."
$SSH "cd $VM_DIR && export NODE_ENV=development PORT=$PORT_DEV CRON_ENABLED=false && \
  pm2 delete $PM2_NAME > /dev/null 2>&1; \
  pm2 start dist-server/server/index.js --name $PM2_NAME --update-env && pm2 save"

echo "==> Verificando o motor..."
sha_arvore() { find "$1" -type f -exec sha256sum {} + | sed "s| .*/dist/| |" | LC_ALL=C sort -k2 | sha256sum | cut -d' ' -f1; }
SHA_LOCAL="$(sha_arvore "$RAIZ/packages/core/dist")"
SHA_VM="$($SSH "cd $VM_DIR/node_modules/@pedidos/core 2>/dev/null && find dist -type f -exec sha256sum {} + | sed 's| .*dist/| |' | LC_ALL=C sort -k2 | sha256sum | cut -d' ' -f1")"
if [[ "$SHA_LOCAL" != "$SHA_VM" ]]; then
  echo "ERRO: @pedidos/core na VM não confere com o build local."
  echo "  local: ${SHA_LOCAL:-<ausente>}"; echo "  VM:    ${SHA_VM:-<ausente>}"; exit 1
fi
echo "OK: motor confere (dist inteiro, sha256 ${SHA_LOCAL:0:12})."

echo "==> Verificando o backend..."
sleep 3
CODE="$($SSH "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT_DEV/api/tenants" || true)"
if [[ -z "$CODE" || "$CODE" == "000" ]]; then
  echo "ERRO: nada respondeu em 127.0.0.1:$PORT_DEV. Log do $PM2_NAME:"
  $SSH "pm2 logs $PM2_NAME --lines 25 --nostream --no-color" || true
  exit 1
fi
echo "OK: backend respondeu $CODE em /api/tenants (401 é o esperado sem token)."

# A porta do nginx é a porta pública; a do backend é interna. Confundir as duas é o erro mais
# provável aqui, então o script diz as duas no fim.
echo
echo "Deploy de DEV concluído."
echo "  backend: 127.0.0.1:$PORT_DEV (pm2 $PM2_NAME)"
echo "  público: https://$VM_HOST:8193  — só funciona depois do nginx e da Security List (ver HANDOFF §4.2)"
