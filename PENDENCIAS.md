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

## A-bis. Deploy — o que já preparei e o que falta

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

## C. Não verificado

| # | Item |
|---|---|
| C1 | `POST /api/offerings/from-catalog` nunca tocou um Firestore — build, typecheck e 65 testes passam, mas o fluxo nunca rodou de ponta a ponta |

## D. Escolhas que eu tomei e você pode vetar

| # | Escolha | Reversível? |
|---|---|---|
| D1 | Repo/infra renomeados para `pedidos-app` (genérico, coerente com o merge futuro) | sim, barato |
| D2 | `colmeia`→`tenant` no código e UI; marca via `APP_NAME` | escolha alinhada ao merge; quebra o `cherry-pick` com a CSA |
| D3 | "Produtor"→**Fornecedor**, "Membro"→**Cliente**, "Colmeia/Padaria"→**Organização** na UI | sim, é só rótulo |
| D4 | Marca do produto = "Pedidos" (`APP_NAME`), nome do tenant vem do dado | sim, uma linha |
| D5 | Portas 3004/8092 reservadas no `DEPLOY-PLAYBOOK.md` | sim, ainda não implantado |
| D6 | Funções padrão do campo `role` removidas (eram CSA); campo agora 100% livre | sim |
