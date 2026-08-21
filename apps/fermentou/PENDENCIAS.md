# Pendências — o que depende de você

Atualizado em 2026-07-19. Nada aqui eu consigo resolver sozinho.

## A. Bloqueios de infraestrutura (travam tudo)

| # | Pendência | Nota |
|---|---|---|
| A1 | `npx -y firebase-tools login` | login interativo na sua conta Google; sem isso a CLI não faz nada |
| A2 | Criar projetos Firebase (dev + prod) | **project ID é permanente e global no Google.** Decidir o nome: genérico (`pedidos-app-dev`/`pedidos-app`, coerente com o motor multi-tenant) ou pelo 1º cliente (`fermentou-dev`/`fermentou`). Se o escolhido estiver tomado, decidir antes de criar |
| A3 | Console → Authentication → habilitar **email/senha** | a CLI não cobre |
| A4 | Console → Firestore → criar banco em `southamerica-east1` | região errada não se corrige depois |
| A5 | Console → Storage → criar bucket | usado pelos comprovantes (`useUploadProof`) |
| A6 | Console → Contas de serviço → gerar chave privada | **baixar direto na máquina; não colar em chat** — é acesso admin ao Firestore inteiro |
| A7 | Decidir de quem é a conta que paga | Storage em projeto novo costuma exigir plano **Blaze** (cartão) |
| A8 | Criar `.env.development` e `.env.production` | só existe `.env.example`; eu preencho quando A2–A6 saírem |

Depois de A1 e A2 eu consigo registrar o app web e escrever as chaves `VITE_FIREBASE_*`
(que são públicas — vão embutidas no JS do browser).

## A-bis. Deploy — FEITO em 2026-07-21 (falta 1 regra no Oracle)

Implantado na VM: `/opt/pedidos-app`, nginx na 8092 (reusa cert LE), pm2 `pedidos-app`
(id 4, `NODE_ENV=production`, lê `.env.production`, conectado ao Firebase `fermentou-9a97d`).
Verificado **na VM**: SPA (200), `/api/setup` responde "já executado" (lê o Firestore real).

**NO AR:** https://csaparahyba.com.br:8092 — ingress 8092 liberado no Oracle SL, acesso
externo confirmado (SPA 200, login → /api/users/me 200). Login email/senha do admin.

### (histórico) O que estava preparado antes do deploy

Pronto no repo (não precisa de você):
- `build:all` gera `dist/` + `dist-server/index.js` ✅
- `deploy/nginx-pedidos-app.conf` — conf da porta **8092** (reusa cert LE, padrão note-app).
  **Não use `setup-vm.sh`** para este app: ele assume `listen 80`, que já é do pedidos-csa.
- `deploy.sh` não shippa mais o `docker-compose.yml` (evolution-api é infra compartilhada da VM).

Falta você (precisa de SSH na VM + Firebase pronto):
| # | Passo |
|---|---|
| A9  | Preencher `deploy.env` (VM_HOST, SSH_KEY) a partir do `deploy.env.example` |
| A10 | Na VM: `sudo mkdir -p /opt/pedidos-app && sudo chown $USER: /opt/pedidos-app` |
| A11 | Copiar `deploy/nginx-pedidos-app.conf` → `sites-available/pedidos-app`, habilitar, `nginx -t`, reload |
| A12 | Liberar a 8092: `iptables -I INPUT -p tcp --dport 8092 -j ACCEPT` + Oracle Ingress TCP 8092 |
| A13 | `bash deploy.sh` da máquina local (build + scp + pm2) |

## B. Decisões de produto

| # | Decisão | Por que trava |
|---|---|---|
| B1 | A cota da Fermentou é assinatura de valor fixo ou por entrega? | define o cálculo em `paymentService`; bloqueia F3 |
| B2 | Pix **pré-entrega** por pedido × motor atual de faturas (mensal, pós-consumo) | são modelos diferentes de cobrança gravando na mesma coleção `payments` |
| B3 | Destino de: período de acolhida, frequência quinzenal, doação de cota, `role` livre | herança da CSA, ativa no código, sem dono |
| B4 | Importação CSV do Google Forms | hoje é 100% CSA (colunas fixas, coluna "Tamanho Cota") — apagar ou readaptar? |
| B5 | Domínio | `fermentou.com.br` próprio ou `csaparahyba.com.br:8092` (padrão da VM; conf já pronto) |
| B6 | Número de WhatsApp dedicado (F2) | hoje seguimos no número compartilhado, só para teste |
| B7 | Merge com pedidos-csa | ver `MERGE.md` — §1 (nome do identificador) é a decisão estrutural, exige migração da CSA |

## C. Estado "pronto pra rodar" — VALIDADO EM PRODUÇÃO (2026-07-21)

Projeto Firebase `fermentou-9a97d` com Auth + Firestore + Storage criados. Fluxo exercitado
de ponta a ponta contra o Firestore real:

| # | Item | Status |
|---|---|---|
| C1 | Login email/senha → `/api/users/me` → `/api/tenants`; `/api/setup` criou tenant Fermentou + admin `superadmin`; `from-catalog` gerou oferta (fixo+extra) e gravou | ✅ validado; dados de teste limpos |
| C3 | `/api/setup` (parametrizado, cria doc do admin) | ✅ exercitado — resolvia o 404 de `/users/me` |
| C2 | **Login por WhatsApp (OTP) e boas-vindas** precisam do evolution-api conectado (F2). Email/senha do admin **não** depende disso | ⬜ pendente F2 |
| C4 | Jobs de cron (cota dia 1, envio terça 6h) sobem no boot; sem dados não fazem nada | ok |

Estado do banco: 1 tenant (Fermentou, id `biYY08CKHpJm2nywMAJC`), 1 user (admin superadmin,
`rafaelsanchezsouza@gmail.com`). Falta: rodar o deploy na VM (A-bis) e cadastrar catálogo real.

## F. Acesso multi-categoria

`acesso` é lista (`superadmin/admin/consumidor/fornecedor`, checkboxes). Abas Clientes (só
consumidores) e Admins; Organizações OFF por `MULTI_TENANT` (src/lib/features.ts). Fornecedor
XOR consumidor. Fornecedor não-admin vê/edita só o próprio contexto (`User.producerId`) em
Catálogo/Ofertas/Verificar Pagamentos; admin sobrepõe. **Validado** com fornecedor de teste.

| # | Status |
|---|---|
| F1 | ✅ Escopo do fornecedor em Catálogo/Ofertas/Pagamentos filtra por `producerId` (frontend) |
| F2 | ✅ Vínculo por **id** (`User.producerId` → entidade fornecedor), não por nome |
| F3 | ✅ **Trava server-side FEITA** (2026-08-21, em produção nos dois apps): `packages/core/src/server/auth.ts` — fornecedor mexe só no que é do seu `producerId`, admin no próprio tenant, e o tenant vem sempre do recurso, nunca do header. 18 testes de caso negativo em `server/auth.test.ts`. **Depende de `User.producerId` preenchido**: fornecedor sem ele não edita nada (nega em vez de liberar). Ver `ARQUITETURA.md`, 10ª fatia da task 6 |

## E. Vender para outro cliente (multi-tenant → SaaS)

O modelo de dados **já é multi-tenant**: nova padaria = novo tenant, isolado por `tenantId`,
mesma instância. Config em **Administração** (superadmin cria em "Nova Organização"; cota/frete/
vencimento/agenda na aba "Configurações"; catálogo/clientes/fornecedores por tenant). O que
falta para virar produto vendável:

| # | Lacuna | Impacto |
|---|---|---|
| E1 | `POST /tenants` não cria o admin da padaria (aponta `adminId` pro superadmin) | onboarding manual: criar o admin dela à mão em cada tenant novo |
| E2 | Isolamento é na camada de app (backend filtra por `tenantId`), **não** em regra do Firestore | bug de escopo = vazamento entre padarias; pente-fino de segurança antes de vender |
| E3 | Sem self-service e sem billing (cobrança da padaria pra você) | provisionar e cobrar por fora |
| E4 | Marca/domínio/tema compartilhados (`APP_NAME` global, uma URL) | não é white-label; cada tenant só muda o próprio nome |
| E5 | Infra compartilhada (1 Firebase, 1 pm2) | deploy ruim ou quota atinge todas as padarias juntas |

## D. Escolhas que eu tomei e você pode vetar

| # | Escolha | Reversível? |
|---|---|---|
| D1 | Repo/infra renomeados para `pedidos-app` (genérico, coerente com o merge futuro) | sim, barato |
| D2 | `colmeia`→`tenant` no código e UI; marca via `APP_NAME` | escolha alinhada ao merge; quebra o `cherry-pick` com a CSA |
| D3 | "Produtor"→**Fornecedor**, "Membro"→**Cliente**, "Colmeia/Padaria"→**Organização** na UI | sim, é só rótulo |
| D4 | Marca do produto = "Pedidos" (`APP_NAME`), nome do tenant vem do dado | sim, uma linha |
| D5 | Portas 3004/8092 reservadas no `DEPLOY-PLAYBOOK.md` | sim, ainda não implantado |
| D6 | Funções padrão do campo `role` removidas (eram CSA); campo agora 100% livre | sim |
