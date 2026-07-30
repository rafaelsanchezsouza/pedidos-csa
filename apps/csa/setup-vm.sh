#!/usr/bin/env bash
# Rodar UMA VEZ na VM: bash setup-vm.sh
set -euo pipefail

APP_DIR="/opt/pedidos-csa"
NGINX_CONF="/etc/nginx/sites-available/pedidos-csa"

# --- Perguntar sobre HTTPS ---
read -rp "Configurar HTTPS com Let's Encrypt? (s/n): " HTTPS_RESP
DOMAIN=""
if [[ "$HTTPS_RESP" =~ ^[Ss]$ ]]; then
  read -rp "Domínio (ex: csaparahyba.com.br): " DOMAIN
  if [[ -z "$DOMAIN" ]]; then
    echo "Domínio não informado. Continuando apenas com HTTP."
  fi
fi
SERVER_NAME="${DOMAIN:-_}"

echo "==> [1/6] Instalando Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> [2/6] Instalando nginx, pm2 e ferramentas..."
sudo apt-get install -y nginx netfilter-persistent
sudo npm install -g pm2
if [[ -n "$DOMAIN" ]]; then
  sudo apt-get install -y certbot python3-certbot-nginx
fi

echo "==> [3/6] Criando pasta da aplicação..."
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

echo "==> [4/6] Configurando nginx..."
sudo tee "$NGINX_CONF" > /dev/null <<EOF
server {
    listen 80;
    server_name $SERVER_NAME;

    # Headers de segurança
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend (SPA)
    root /opt/pedidos-csa/dist;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/pedidos-csa
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo "==> [5/6] Configurando pm2 para iniciar no boot..."
pm2 startup | tail -1 | sudo bash
pm2 save

if [[ -n "$DOMAIN" ]]; then
  echo "==> [6/6] Configurando HTTPS com Let's Encrypt..."
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
    --non-interactive --agree-tos -m "admin@$DOMAIN"
  echo ""
  echo "HTTPS configurado em https://$DOMAIN"
else
  echo "==> [6/6] HTTPS ignorado (nenhum domínio fornecido)"
fi

echo ""
echo "Setup concluído!"
echo "Próximo passo: rode deploy.sh na sua máquina local."
if [[ -n "$DOMAIN" ]]; then
  echo ""
  echo "ATENÇÃO: abra a porta 443 no Oracle Cloud Console:"
  echo "  Networking → VCN → Security Lists → Add Ingress Rule"
  echo "  Protocol: TCP | Destination Port: 443 | Source: 0.0.0.0/0"
fi
