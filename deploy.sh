#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuração — ajuste antes do primeiro uso
# ---------------------------------------------------------------------------
VM_USER="ubuntu"
VM_HOST="SEU_IP_AQUI"
VM_DIR="/opt/pedidos-csa"
SSH_KEY="~/.ssh/id_rsa"       # caminho para sua chave privada SSH
ENV_FILE=".env.production"    # arquivo de env local a copiar como .env na VM
# ---------------------------------------------------------------------------

SSH="ssh -i $SSH_KEY $VM_USER@$VM_HOST"
RSYNC="rsync -avz --delete -e \"ssh -i $SSH_KEY\""

echo "==> [1/5] Build local..."
npm run build:all

echo "==> [2/5] Copiando artefatos para a VM..."
eval "$RSYNC dist/        $VM_USER@$VM_HOST:$VM_DIR/dist/"
eval "$RSYNC dist-server/ $VM_USER@$VM_HOST:$VM_DIR/dist-server/"
scp -i "$SSH_KEY" package.json package-lock.json "$VM_USER@$VM_HOST:$VM_DIR/"
scp -i "$SSH_KEY" "$ENV_FILE" "$VM_USER@$VM_HOST:$VM_DIR/.env"

echo "==> [3/5] Instalando dependências de produção..."
$SSH "cd $VM_DIR && npm install --omit=dev --prefer-offline"

echo "==> [4/5] Reiniciando servidor..."
$SSH "cd $VM_DIR && pm2 describe pedidos-csa > /dev/null 2>&1 \
  && pm2 restart pedidos-csa \
  || pm2 start dist-server/index.js --name pedidos-csa && pm2 save"

echo "==> [5/5] Verificando status..."
$SSH "pm2 status pedidos-csa"

echo ""
echo "Deploy concluído! App disponível em http://$VM_HOST"
