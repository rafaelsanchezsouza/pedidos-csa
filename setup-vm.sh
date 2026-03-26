#!/usr/bin/env bash
# Rodar UMA VEZ na VM: bash setup-vm.sh
set -euo pipefail

APP_DIR="/opt/pedidos-csa"
NGINX_CONF="/etc/nginx/sites-available/pedidos-csa"

echo "==> [1/5] Instalando Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> [2/5] Instalando nginx e pm2..."
sudo apt-get install -y nginx
sudo npm install -g pm2

echo "==> [3/5] Criando pasta da aplicação..."
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

echo "==> [4/5] Configurando nginx..."
sudo tee "$NGINX_CONF" > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    # Frontend (SPA)
    root /opt/pedidos-csa/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/pedidos-csa
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> [5/5] Configurando pm2 para iniciar no boot..."
pm2 startup | tail -1 | sudo bash
pm2 save

echo ""
echo "Setup concluído!"
echo "Próximo passo: rode deploy.sh na sua máquina local."
