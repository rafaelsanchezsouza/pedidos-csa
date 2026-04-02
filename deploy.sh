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
scp -i "$SSH_KEY" "$ENV_FILE" "$VM_USER@$VM_HOST:$VM_DIR/.env"

echo "==> [3/5] Ajustando permissões do .env na VM..."
$SSH "chmod 600 $VM_DIR/.env"

echo "==> [4/5] Instalando dependências de produção..."
$SSH "cd $VM_DIR && npm ci --omit=dev"

echo "==> [5/5] Reiniciando servidor..."
$SSH "cd $VM_DIR && pm2 describe pedidos-csa > /dev/null 2>&1 \
  && pm2 restart pedidos-csa \
  || pm2 start dist-server/index.js --name pedidos-csa && pm2 save"

echo ""
echo "Deploy concluído! App disponível em http://$VM_HOST"
