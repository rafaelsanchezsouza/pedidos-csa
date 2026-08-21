> ⚠️ **SUPERSEDIDO** por [`../../HANDOFF.md`](../../HANDOFF.md) (2026-08-21). Este documento
> descreve o app quando ele era o repo `pedidos-app` sozinho: os comandos de deploy, a estrutura
> do server e o estado das features **mudaram** com o monorepo. Segue aqui como histórico do
> primeiro cliente e das decisões de produto.

# Handoff — pedidos-app (Fermentou)

Estado em 2026-07-21. Motor genérico de pedidos/entregas multi-tenant, fork do `pedidos-csa`.
Primeiro cliente: padaria **Fermentou**. **No ar e funcional.**

Docs relacionados: `requirements.md` (visão), `definicoes_projeto.md` (técnico),
`BUSINESS_RULES.md` (regras), `BACKLOG.md` (fases), `PENDENCIAS.md` (o que falta),
`MERGE.md` (fork × pedidos-csa + port-back).

---

## 1. Onde está rodando

| | |
|---|---|
| **URL** | https://csaparahyba.com.br:8092 (login email/senha) |
| **Firebase** | projeto `fermentou-9a97d` — Auth (email/senha + OTP WhatsApp), Firestore, Storage |
| **VM** | Oracle `csaparahyba.com.br`; `/opt/pedidos-app`; pm2 `pedidos-app` (id 4); backend em `127.0.0.1:3004`, `NODE_ENV=production` |
| **nginx** | porta 8092, reusa cert Let's Encrypt; conf em `deploy/nginx-pedidos-app.conf` |
| **Admin/dev** | `rafaelsanchezsouza@gmail.com` — `acesso: [superadmin, admin]` |
| **Tenant** | Fermentou, id `biYY08CKHpJm2nywMAJC`; fornecedor padrão "Fermentou" (id `Vf5OK4GYZnw7TkTwuKnV`) |
| **WhatsApp** | instância **compartilhada** `pedidos-csa` (número da CSA), só para teste — OTP funciona; número dedicado é F2 |

⚠️ **Segurança:** a senha do admin e a chave da conta de serviço apareceram no histórico da
sessão que montou isto. Recomendado: trocar a senha no app e **rotacionar** a chave (Console →
Contas de serviço → gerar nova → atualizar `.env.production`). O JSON `*-adminsdk-*.json` na raiz
é redundante (as chaves estão no `.env.production`) e está gitignored — pode apagar.

---

## 2. Rodar, testar, deployar

```bash
npm run dev:all        # front (5173) + back (3004). PRECISA de .env.development (ver Pendência abaixo)
npm test               # Vitest — 65 testes (lógica + AdminPage)
npm run test:tz        # data/fuso em BR/UTC/UTC+14 (já quebrou 3x — não pular)
npm run build          # tsc -b + vite (front); build:all inclui o backend
bash deploy.sh         # build + scp + npm ci + pm2 restart (usa deploy.env, gitignored)
```

**Deploy** já está configurado: `deploy.env` (local, gitignored) tem VM/SSH; o setup de 1ª vez na
VM (dir, nginx, iptables, ingress 8092 no Oracle) já foi feito. Deploy novo = só `bash deploy.sh`.

**Pendência de dev local:** não existe `.env.development` — `npm run dev` quebra o Firebase no
boot (`auth/invalid-api-key`). Para ver a UI localmente hoje: `npm run build && npx vite preview`
(o build de produção tem as chaves embutidas, mas sem backend/proxy `/api` — só serve pra ver
telas públicas). Para dev de verdade: criar `.env.development` (as chaves `VITE_*` são as mesmas
do `.env.production`; decidir se dev aponta pro mesmo Firebase ou um projeto de dev separado).

**Ver rodando de verdade** (o que usei nesta sessão): dirigir o site com Playwright headless via
`~/repos/note-app/node_modules/playwright-core` (chromium em `~/.cache/ms-playwright`). Login por
email/senha, screenshot. Foi assim que validei cada feature no site real, não só nos testes.

---

## 3. Convenções e armadilhas (o que não é óbvio)

- **`acesso` é lista** (`superadmin|admin|consumidor|fornecedor`), não string. **Sempre** checar
  via predicados: `src/lib/acesso.ts` (front) / `server/services/acesso.ts` (back). Eles
  normalizam rótulos legados (`user`→`consumidor`, `produtor`→`fornecedor`). Nunca comparar
  `user.acesso === 'admin'`.
- **Flag `MULTI_TENANT`** (`src/lib/features.ts`) = `false`: esconde toda a UI de organização
  (header/sidebar + aba Organizações). Ligar para gerir mais de uma loja.
- **Colapso quando singular**: com 1 fornecedor, some seletor/coluna/filtro de fornecedor em
  Catálogo/Ofertas/Consolidado/Meus Pedidos; reaparece ao adicionar o 2º. Idem organização.
- **Escopo do fornecedor**: fornecedor não-admin vê/edita só o do seu `User.producerId`. Admin
  sobrepõe. **Só no frontend** — trava server-side é a Pendência F3.
- **Marca**: tudo de identidade em `src/lib/brand.ts` (`BRAND`: nome/tagline/ícone/paleta);
  `applyBrand()` no `main.tsx` injeta as cores nas CSS vars no boot. Trocar de cliente = 1 arquivo.
- **Datas/fuso**: `weekUtils.ts` (client) e `weekMath.ts` (server) duplicam a mesma regra,
  travada por `weekMath.test.ts`. Mexer num exige mexer no outro. Rodar `test:tz`.
- **Deploy sem CI**: o verde local é o único portão. Merge em `main` não faz deploy.
- **Env em produção**: `env.ts` carrega `.env.production` quando `NODE_ENV=production`; o
  `deploy.sh` copia com esse nome e sobe o pm2 com essa var (corrigido — o `pedidos-csa` tem
  isso frágil, ver `MERGE.md` §6.3).

---

## 4. Estado das features

| Área | Estado |
|---|---|
| Auth email/senha + login OTP WhatsApp | ✅ no ar |
| Catálogo (produto: tipo fixo/extra, ativo) | ✅ |
| Oferta da semana gerada do catálogo (`/offerings/from-catalog`) | ✅ validado |
| Pedidos, consolidado, travamento de semana | ✅ (herdado) |
| Entregas + ordenação manual + texto motoboy | ✅ (herdado) |
| Faturas: cota mensal, extras, frete | ✅ (herdado) |
| Acesso multi-categoria + abas Clientes/Admins | ✅ validado |
| Cadastro por tipo (Cliente/Fornecedor/Admin) + campos dinâmicos | ✅ modal criar/editar |
| Cotas dinâmicas (N tiers, editáveis em Configurações; cascata no rename) | ✅ |
| Fornecedor com escopo por `producerId` (frontend) | ✅ validado |
| Marca Fermentou (nome/ícone/paleta light+dark) | ✅ |
| WhatsApp número dedicado (F2) | ⬜ usa o compartilhado |
| Pix pré-entrega por pedido (F3) | ⬜ decisão de produto pendente (B1/B2) |
| Trava server-side do escopo de fornecedor | ⬜ Pendência F3 |

---

## 5. Próximos passos sugeridos

Em ordem do que eu faria:

0. **Renomear as cotas da Fermentou** (Administração → Configurações → Cotas). O tenant já existente
   ainda mostra os tiers legados "Cota inteira/Meia cota" (derivados do `quotaInteira/quotaMeia`);
   renomeie para "Fornada Completa/Leve" e ajuste o termo para "Fornada". O rename faz **cascata**
   nos usuários (migra `User.quota`). Tenant novo já nasce com esses nomes.
1. **Cadastrar o catálogo real da Fermentou** (Administração → Catálogo). É o que falta pra virar
   uso de verdade; você faz pela tela.
2. **Criar o usuário do dono da Fermentou** — marcar `Fornecedor` (vincula ao Fermentou sozinho).
   **Antes de dar esse acesso**, fechar a **Pendência F3** (trava server-side): sem ela, um
   fornecedor pode editar produto de outro via API direta.
3. **Segurança**: trocar senha do admin + rotacionar a chave de serviço.
4. **WhatsApp dedicado (F2)** quando for pra clientes reais — criar instância própria no
   evolution-api (mesmo serviço, número novo; ver `~/repos/ZAP-PROTOCOL.md`).
5. **Pix (F3)** — decidir o modelo de cobrança (B1/B2 em `PENDENCIAS.md`) antes de codar; afeta
   o desenho de `payments` e o merge futuro.
6. **Port-back para o pedidos-csa** — ver `MERGE.md` §6: OTP com nome do tenant, `/api/setup`
   robusto e o fix de deploy valem para a CSA hoje, sem esperar o merge.
