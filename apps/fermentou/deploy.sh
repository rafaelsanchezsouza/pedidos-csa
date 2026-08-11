#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuração — copie deploy.env.example para deploy.env e preencha
# ---------------------------------------------------------------------------
if [[ ! -f deploy.env ]]; then
  echo "Erro: arquivo deploy.env não encontrado. Copie deploy.env.example e preencha."
  exit 1
fi
# shellcheck source=deploy.env
source deploy.env
# ---------------------------------------------------------------------------

SSH="ssh -i $SSH_KEY $VM_USER@$VM_HOST"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"  # raiz do monorepo
CORE_TGZ="pedidos-core-0.1.0.tgz"

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "==> [1/6] Build local (core primeiro — o app consome o dist dele)..."
  npm --prefix "$RAIZ" run build -w @pedidos/core
  npm run build:all
else
  echo "==> [1/6] Build ignorado (--skip-build)"
fi

# @pedidos/core é um workspace: `npm install` na VM não tem como resolvê-lo. A solução é
# levá-lo como tarball (npm pack empacota o dist, conforme package.json#files) e reescrever a
# dependência para `file:` no package.json que vai junto. Sem isto o deploy quebra no install.
echo "==> [2/6] Empacotando @pedidos/core..."
rm -f "$CORE_TGZ"
# `npm pack <caminho>`: com --prefix ele empacotaria o app, não o core.
npm pack "$RAIZ/packages/core" --pack-destination "$PWD" > /dev/null
test -f "$CORE_TGZ" || { echo "Erro: $CORE_TGZ não foi gerado"; exit 1; }

# package.json de produção: mesma coisa, com a dep do core apontando para o tarball.
# O package-lock.json do app é resquício de quando era repo próprio — no monorepo o lock é o
# da raiz, e ele não vale na VM. Por isso `npm install` (e não `npm ci`, que exige lock).
node -e "
  const p = require('./package.json');
  p.dependencies['@pedidos/core'] = 'file:./$CORE_TGZ';
  require('fs').writeFileSync('package.deploy.json', JSON.stringify(p, null, 2));
"

echo "==> [3/6] Copiando artefatos para a VM..."
$SSH "rm -rf $VM_DIR/dist $VM_DIR/dist-server $VM_DIR/package-lock.json"
scp -i "$SSH_KEY" -r dist/        "$VM_USER@$VM_HOST:$VM_DIR/dist"
scp -i "$SSH_KEY" -r dist-server/ "$VM_USER@$VM_HOST:$VM_DIR/dist-server"
scp -i "$SSH_KEY" "$CORE_TGZ"     "$VM_USER@$VM_HOST:$VM_DIR/$CORE_TGZ"
scp -i "$SSH_KEY" package.deploy.json "$VM_USER@$VM_HOST:$VM_DIR/package.json"
# env.ts em produção carrega `.env.production` (NODE_ENV=production); copiar com esse nome.
scp -i "$SSH_KEY" "$ENV_FILE" "$VM_USER@$VM_HOST:$VM_DIR/.env.production"
rm -f package.deploy.json
# evolution-api NÃO é deployado por este app: é infra compartilhada da VM (já roda na 8080).
# O docker-compose.yml do repo é referência local; não vai pra VM.

echo "==> [4/6] Ajustando permissões do .env na VM..."
$SSH "chmod 600 $VM_DIR/.env.production"

echo "==> [5/6] Instalando dependências de produção..."
$SSH "cd $VM_DIR && npm install --omit=dev --no-audit --no-fund"

echo "==> [6/6] Reiniciando servidor (NODE_ENV=production)..."
$SSH "cd $VM_DIR && export NODE_ENV=production && \
  (pm2 restart pedidos-app --update-env || pm2 start dist-server/server/index.js --name pedidos-app --update-env) && pm2 save"

echo ""
echo "Deploy concluído! App disponível em https://$VM_HOST"
