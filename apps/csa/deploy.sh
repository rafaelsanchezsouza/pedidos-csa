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
# Nome CARIMBADO por deploy. O npm resolve dep `file:` pelo caminho: com nome fixo e versão
# fixa (0.1.0, que nunca muda), ele responde "up to date" e NÃO reinstala o core — foi assim
# que a trava de autorização ficou fora do ar depois de um deploy verde. Nome novo = spec nova
# = reinstalação garantida.
CORE_TGZ_PACK="pedidos-core-0.1.0.tgz"
CORE_TGZ="pedidos-core-$(date +%Y%m%d%H%M%S).tgz"

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
rm -f pedidos-core-*.tgz
# `npm pack <caminho>`: com --prefix ele empacotaria o app, não o core.
npm pack "$RAIZ/packages/core" --pack-destination "$PWD" > /dev/null
test -f "$CORE_TGZ_PACK" || { echo "Erro: $CORE_TGZ_PACK não foi gerado"; exit 1; }
mv "$CORE_TGZ_PACK" "$CORE_TGZ"

# package.json de produção: mesma coisa, com a dep do core apontando para o tarball.
# O package-lock.json do app é resquício de quando era repo próprio — no monorepo o lock é o
# da raiz, e ele não vale na VM. Por isso `npm install` (e não `npm ci`, que exige lock).
node -e "
  const p = require('./package.json');
  p.dependencies['@pedidos/core'] = 'file:./$CORE_TGZ';
  require('fs').writeFileSync('package.deploy.json', JSON.stringify(p, null, 2));
"

echo "==> [3/6] Copiando artefatos para a VM..."
# Tarballs antigos e a cópia instalada do core saem juntos: o npm não tem como reaproveitar
# uma árvore obsoleta se ela não existe mais.
$SSH "rm -rf $VM_DIR/dist $VM_DIR/dist-server $VM_DIR/package-lock.json \
  $VM_DIR/pedidos-core-*.tgz $VM_DIR/node_modules/@pedidos/core"
scp -i "$SSH_KEY" -r dist/        "$VM_USER@$VM_HOST:$VM_DIR/dist"
scp -i "$SSH_KEY" -r dist-server/ "$VM_USER@$VM_HOST:$VM_DIR/dist-server"
scp -i "$SSH_KEY" "$CORE_TGZ"     "$VM_USER@$VM_HOST:$VM_DIR/$CORE_TGZ"
scp -i "$SSH_KEY" package.deploy.json "$VM_USER@$VM_HOST:$VM_DIR/package.json"
scp -i "$SSH_KEY" "$ENV_FILE" "$VM_USER@$VM_HOST:$VM_DIR/.env"
scp -i "$SSH_KEY" docker-compose.yml "$VM_USER@$VM_HOST:$VM_DIR/docker-compose.yml"
rm -f package.deploy.json

echo "==> [4/6] Ajustando permissões do .env na VM..."
$SSH "chmod 600 $VM_DIR/.env"

echo "==> [5/6] Instalando dependências de produção..."
$SSH "cd $VM_DIR && npm install --omit=dev --no-audit --no-fund"

echo "==> [6/6] Reiniciando servidor (NODE_ENV=production)..."
# NODE_ENV explícito: env.ts só carrega .env.production com ele setado, e --update-env garante
# que o pm2 releia o ambiente em vez de reusar o da primeira vez que subiu (MERGE.md §6.3).
# `pm2 restart` reusa o script gravado na PRIMEIRA subida e ignora um caminho novo — foi assim
# que o 1º deploy real derrubou o app quando a emissão mudou para dist-server/server/. delete +
# start garante que o processo sempre aponte para o build atual.
$SSH "cd $VM_DIR && export NODE_ENV=production && \
  pm2 delete pedidos-csa > /dev/null 2>&1; \
  pm2 start dist-server/server/index.js --name pedidos-csa --update-env && pm2 save"

# Sem CI, o deploy é o único momento em que o código roda de verdade: ele mesmo precisa dizer
# se subiu. "pm2 online" não basta — um crash loop também aparece como online por alguns
# segundos. Qualquer HTTP (401 inclusive) prova que o processo está ouvindo.
# "Instalou" não é "instalou o NOSSO core": comparar o artefato local com o que ficou na VM é
# a única prova. Sem isto, um core obsoleto passa despercebido por um deploy inteiro.
echo "==> Verificando se o motor instalado é o que acabamos de buildar..."
SHA_LOCAL="$(sha256sum "$RAIZ/packages/core/dist/server/index.js" | cut -d' ' -f1)"
SHA_VM="$($SSH "sha256sum $VM_DIR/node_modules/@pedidos/core/dist/server/index.js 2>/dev/null | cut -d' ' -f1")"
if [[ "$SHA_LOCAL" != "$SHA_VM" ]]; then
  echo "ERRO: @pedidos/core na VM não confere com o build local."
  echo "  local: ${SHA_LOCAL:-<ausente>}"
  echo "  VM:    ${SHA_VM:-<ausente>}"
  exit 1
fi
echo "OK: motor confere (sha256 ${SHA_LOCAL:0:12})."

echo "==> Verificando se o backend respondeu..."
PORT_APP="$(grep -E '^PORT=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d "\"' ")"
sleep 3
CODE="$($SSH "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT_APP/api/tenants" || true)"
if [[ -z "$CODE" || "$CODE" == "000" ]]; then
  echo "ERRO: nada respondeu em 127.0.0.1:$PORT_APP. Log do pedidos-csa:"
  $SSH "pm2 logs pedidos-csa --lines 20 --nostream --no-color"
  exit 1
fi
echo "OK: backend respondeu $CODE em /api/tenants (401 é o esperado sem token)."

echo ""
echo "Deploy concluído! App disponível em https://$VM_HOST"
