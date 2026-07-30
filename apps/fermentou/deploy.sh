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

if [[ "${1:-}" != "--skip-build" ]]; then
  echo "==> [1/5] Build local..."
  npm run build:all
else
  echo "==> [1/5] Build ignorado (--skip-build)"
fi

echo "==> [2/5] Copiando artefatos para a VM..."
$SSH "rm -rf $VM_DIR/dist $VM_DIR/dist-server"
scp -i "$SSH_KEY" -r dist/        "$VM_USER@$VM_HOST:$VM_DIR/dist"
scp -i "$SSH_KEY" -r dist-server/ "$VM_USER@$VM_HOST:$VM_DIR/dist-server"
scp -i "$SSH_KEY" package.json package-lock.json "$VM_USER@$VM_HOST:$VM_DIR/"
# env.ts em produção carrega `.env.production` (NODE_ENV=production); copiar com esse nome.
scp -i "$SSH_KEY" "$ENV_FILE" "$VM_USER@$VM_HOST:$VM_DIR/.env.production"
# evolution-api NÃO é deployado por este app: é infra compartilhada da VM (já roda na 8080).
# O docker-compose.yml do repo é referência local; não vai pra VM.

echo "==> [3/5] Ajustando permissões do .env na VM..."
$SSH "chmod 600 $VM_DIR/.env.production"

echo "==> [4/5] Instalando dependências de produção..."
$SSH "cd $VM_DIR && npm ci --omit=dev"

echo "==> [5/5] Reiniciando servidor (NODE_ENV=production)..."
$SSH "cd $VM_DIR && export NODE_ENV=production && \
  (pm2 restart pedidos-app --update-env || pm2 start dist-server/index.js --name pedidos-app --update-env) && pm2 save"

echo ""
echo "Deploy concluído! App disponível em https://$VM_HOST"
