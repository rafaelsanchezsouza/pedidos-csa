# Handoff — monorepo `pedidos`

Estado em **2026-09-28**. Motor único (`packages/core`) + dois apps deployáveis sozinhos
(`apps/csa`, `apps/fermentou`). **Os dois estão no ar rodando deste monorepo.** Os repos
pré-monorepo (`~/repos/pedidos-csa`, `~/repos/pedidos-app`) foram **apagados em 2026-09-28** —
a limpeza do legado (2026-08-31) já tinha encerrado o papel de rollback deles; ver §4.

⚠️ **Este diretório é a cópia única** das credenciais de produção: `.env.production` dos dois
apps, `.env.development` da CSA, os `deploy.env` e as chaves de service account do Firebase em
`apps/csa/private/`. Até 28/09 havia backup nos repos antigos; não há mais. Nada disso vai para
o GitHub (o repositório é **público**), então perder o disco é perder as credenciais.

Leia junto: **`ARQUITETURA.md`** (decisões, histórico fatia a fatia, o porquê de cada escolha) e
**`CLAUDE.md`** (regras de trabalho e portão de verificação).

---

## 1. Onde está rodando

| | CSA | Fermentou |
|---|---|---|
| **URL** | https://csaparahyba.com.br | https://csaparahyba.com.br:8092 |
| **Firebase** | `pedidos-csa` | `fermentou-9a97d` |
| **pm2** | `pedidos-csa` | `pedidos-app` |
| **Backend** | `127.0.0.1:3001` | `127.0.0.1:3004` |
| **Dir na VM** | `/opt/pedidos-csa` | `/opt/pedidos-app` |
| **Entrypoint** | `dist-server/server/index.js` | `dist-server/server/index.js` |
| **Oferta nasce de** | mensagem do produtor (`parse-message`, parser `fuzzy`) | catálogo (`from-catalog`) |
| **Rótulo da não-entrega** | `Colmeia` | `Retirada` |

O código dos **dois** apps vive em `github.com/rafaelsanchezsouza/pedidos-csa` (o repo da CSA
foi reaproveitado; a `main` de lá é este monorepo desde 2026-08-28). A tag **`pre-monorepo`**
marca o último commit do layout antigo — é o único rollback que sobrou no remoto, e ele é
anterior à migração canônica, então serve de referência histórica, não de plano de volta.
O Fermentou nunca teve repo no GitHub: o código dele só existe aqui.

VM Oracle única (`csaparahyba.com.br`), nginx na frente, cert Let's Encrypt compartilhado.
O `evolution-api` (WhatsApp) é **infra da VM**, na 8080 — não é deployado por nenhum dos apps.
Hoje os dois usam a **mesma instância** do WhatsApp (número da CSA); número dedicado para o
Fermentou segue pendente.

## 2. Rodar e testar

### Rodar em desenvolvimento (CSA)

```bash
cd apps/csa
npm run dev          # front (Vite), porta 5173
npm run dev:server   # backend, porta 3001 — NODE_ENV=development
npm run dev:all      # os dois juntos
```

Aponta para o Firebase **`pedidos-csa-dev`**, separado do prod. O `.env.development` é
**gitignored**: numa máquina nova, copie junto com os outros segredos (§3). O mesmo projeto
serve o local e (quando existir) o dev hospedado — não há um terceiro Firebase.

O banco de dev tinha ficado no modelo pré-canônico (`colmeias`/`colmeiaId`) — a migração de
2026-08-21 nunca fora aplicada lá, e o código atual, que procura `tenants`, enxergava um banco
vazio apesar dos dados existirem. **Migrado em 2026-09-28**: 2 tenants, 97 docs, 4
`deliveryType`, sem erro. Os 7 usuários e 44 produtos de teste seguem lá.

O script aponta para dev sempre que **não** recebe `FIREBASE_ENV=prod` — útil para repetir num
banco de dev novo:

```bash
cd apps/csa
npx tsx scripts/migrate-csa-canonico.ts                        # ensaio
npx tsx scripts/migrate-csa-canonico.ts --executar --limpar-legado
```

As senhas dos usuários de dev não estão em lugar nenhum: para entrar, redefina uma no console do
Firebase (projeto `pedidos-csa-dev` → Authentication → o usuário → editar senha).

⚠️ **Dev compartilha as integrações externas com a produção — decisão consciente
(2026-09-28).** Só o Firebase é separado (`pedidos-csa-dev`); a instância do WhatsApp
(`pedidos-csa`) e o repo de issues são **os mesmos** da produção:

| | dev | prod |
|---|---|---|
| Firebase | `pedidos-csa-dev` | `pedidos-csa` |
| WhatsApp (Evolution) | `pedidos-csa` | `pedidos-csa` |
| GitHub (issues) | `pedidos-csa` | `pedidos-csa` |

Na prática: uma ação manual em dev que dispare mensagem (OTP, aviso a produtor) **sai de
verdade**, pelo número da CSA. O usuário administra esse celular e aceita o risco — não é
descuido, é escolha. Quem for mexer precisa saber disso antes de clicar.

⚠️ **O cron não sobe fora de produção** (`CRON_ENABLED`). Não é conveniência: o
`.env.development` aponta para a **mesma instância do WhatsApp** e o mesmo GitHub que a
produção. Um `npm run dev` aberto na hora do envio mandaria mensagem de verdade para produtor
de verdade. Para exercitar o job de propósito: `CRON_ENABLED=true npm run dev:server`.

### Rodar os testes

```bash
npm install
npm run build -w @pedidos/core               # SEMPRE antes dos apps — eles consomem o dist/
npm run test:tz --workspaces --if-present    # ×3 fusos (BR/UTC/UTC+14) — NÃO PULAR
npm run build -w pedidos-csa  && npm run build:backend -w pedidos-csa
npm run build -w fermentou  && npm run build:backend -w fermentou
```

Placar atual (2026-09-28): **core 250**, **csa 52**, **fermentou 9** — todos ×3 fusos.
**Sem CI: o verde local é o único portão.** Mudou estrutura de emissão? `rm -rf apps/*/dist-server`
antes (o `tsc` não limpa o `outDir`).

⚠️ O `testTimeout` dos apps é **20s**, não o padrão de 5s (`vite.config.ts`). Não é folga à toa:
cada teste de componente sobe um jsdom (84s dos ~91s da suíte da CSA) e, sob paralelismo,
estouravam os 5s de forma aleatória — 4 a 8 falhas variando a cada execução, em testes
diferentes. Portão que pisca ensina a ignorar vermelho.

## 3. Deployar

```bash
cd apps/<app> && bash deploy.sh          # build + npm pack do core + scp + npm install + pm2
cd apps/<app> && bash deploy.sh --skip-build
```

O script **se verifica no fim**: lê `PORT` do `.env.production`, bate em `/api/tenants` pelo
localhost da VM e falha imprimindo o log do pm2 se nada responder. `OK: backend respondeu 401` é
o resultado bom — 401 é o esperado sem token.

**Merge em `main` não faz deploy.** Produção só muda rodando `deploy.sh`.

### Segredos — não estão no git
Cada app precisa de dois arquivos **gitignored**, que não vieram no `git subtree`:

| Arquivo | O que é | Onde tem cópia |
|---|---|---|
| `apps/<app>/.env.production` | Firebase, Evolution, GitHub, OpenAI, `PORT` | só neste diretório |
| `apps/csa/.env.development` | idem, apontando para o Firebase `pedidos-csa-dev` | só neste diretório |
| `apps/csa/deploy.env` e `apps/fermentou/deploy.env` | VM_USER/VM_HOST/VM_DIR/SSH_KEY/ENV_FILE | só neste diretório |

⚠️ **Não há mais segunda cópia.** Até 2026-09-28 os repos antigos guardavam um backup desses
arquivos; eles foram apagados. Perder este diretório é perder as credenciais — as chaves de
service account do Firebase (prod e dev) estão em `apps/csa/private/`, também gitignored.
| `apps/<app>/deploy.env` | VM_USER/VM_HOST/VM_DIR/SSH_KEY/ENV_FILE | idem |

Numa máquina nova, copie os quatro antes de qualquer deploy.

## 4. Estado da migração da CSA (importante)

A produção da CSA foi migrada para o modelo canônico em **2026-08-21**, de forma **aditiva**:

- `tenants` criada (mesmos ids de `colmeias`, que continua lá)
- `tenantId` escrito em 458 docs, **`colmeiaId` preservado ao lado**
- `deliveryType 'colmeia'` → `'retirada'` em 18 docs (única mudança não-aditiva)

**A limpeza rodou em 2026-08-31** (`--executar --limpar-legado`): 460 docs perderam o
`colmeiaId`, sem erro nem divergência no dry-run. O modelo em produção é só o canônico.

**Não há mais rollback por redeploy.** Voltar ao código antigo exigiria restaurar o backup de
21/08 — e isso custaria tudo que entrou desde então. O caminho de volta agora é corrigir para
frente.

Backup da véspera da migração: `~/backup-csa-2026-08-21.json` (463 docs). **Tem dados pessoais
de membros** — fora do repo. Ele passou a ser o único rollback que existe: só apague quando a
acolhida estiver rodando redonda por algumas semanas.

Sinal de saúde colhido no dry-run: em várias coleções o total canônico é **maior** que o legado
removido (users 46 × 39, payments 220 × 215). São docs criados depois da migração — prova de que
o código novo nunca escreveu o campo legado.

## 4.1 Pendente: renomear a infra do Fermentou na VM

O workspace npm virou `fermentou` em 2026-09-28, mas **na VM ele ainda se chama
`pedidos-app`** — pm2, `/opt/pedidos-app` e o server block do nginx. A divergência é
proposital: renomear o que está no ar exige deploy e mexer em diretório de produção, e não
valia arrastar isso para uma limpeza de repositório.

Quando for fazer, nesta ordem (o `deploy.sh` **não** cria o diretório; ele só copia para dentro):

```bash
# 1. na VM: criar o novo, levar o conteúdo, manter o velho até validar
ssh -i ~/.ssh/pedidos-csa.key ubuntu@csaparahyba.com.br '
  sudo mkdir -p /opt/fermentou && sudo chown ubuntu:ubuntu /opt/fermentou
  cp -a /opt/pedidos-app/.env.production /opt/fermentou/'

# 2. no repo: VM_DIR em apps/fermentou/deploy.env, e o nome do pm2 em deploy.sh (2 lugares)
# 3. deploy — o script já faz pm2 delete + start, então o processo novo sobe limpo
cd apps/fermentou && bash deploy.sh

# 4. nginx: `root /opt/pedidos-app/dist` -> /opt/fermentou/dist em
#    /etc/nginx/sites-available/pedidos-app; sudo nginx -t && sudo systemctl reload nginx
# 5. validar a porta 8092 e só então: pm2 delete pedidos-app; sudo rm -rf /opt/pedidos-app
```

⚠️ O passo 4 é o que derruba o site se esquecido: o deploy novo escreve em `/opt/fermentou`
enquanto o nginx continua servindo o `dist` do diretório velho — a API responde atualizada e a
tela fica congelada na versão anterior, sem erro nenhum aparecer.

## 5. Convenções e armadilhas (o que não é óbvio)

**Do motor**
- Rotas e serviços do core são **factories `(deps, config)`**. Portas em
  `packages/core/src/server/repo.ts` (`Repo`, `AuthGateway`, `WhatsAppGateway`) e
  `parseMessage.ts` (`MessageParser`).
- **Adapters ficam no app**: `server/adapters.ts`, `repositories/firestore.ts`,
  `middleware/auth.ts`, `services/whatsapp/`, jobs (cron é infra do app).
- **O engine não lê `process.env`** — integrações e segredos entram no boot do app.
- `@pedidos/core/server` é export separado do barrel raiz (o front importa `@pedidos/core` e não
  pode arrastar express); `@pedidos/core/ui` idem para React.
- Editar o core exige `npm run build -w @pedidos/core` para o server enxergar a mudança.

**De permissão**
- A autorização é do **servidor** (`packages/core/src/server/auth.ts`). Rota que muda dado ou lê
  dado de terceiro carrega o `Ator` e checa. O tenant vem do **recurso**, nunca do header.

**Dos dados**
- **`acesso` é lista** no modelo, mas a produção da CSA tem **string** (`'user'`/`'admin'`). Os
  predicados do core são **dual-mode** e normalizam rótulos legados (`user`→`consumidor`,
  `produtor`→`fornecedor`). **Nunca** comparar `user.acesso === 'admin'` — use `isAdmin` e cia.
- `deliveryType`: o motor só pergunta `isEntrega(u)`. O token de não-entrega é vocabulário de UI
  e **nunca** decide regra.
- Cuidado ao renomear: na CSA, `colmeia` em `roleDefaults` é **função no coletivo**, não tipo de
  entrega. E o texto de tela ("Nova Colmeia") é vocabulário do app, não modelo.

**De data e fuso**
- A regra de semana/quinzena já quebrou **3×** por fuso. `test:tz` roda em BR/UTC/UTC+14 e **não
  pode ser pulado**. A lógica é única, em `packages/core/src/domain/week.ts`.

**De UI**
- Componentes do core precisam de `../../packages/core/src/ui/**/*.tsx` no `content` do Tailwind
  de cada app. **Sem isso o build passa e o layout quebra em silêncio.**
- `applyBrand(brand, 'light'|'dark'|'auto')` — o tema é **parâmetro obrigatório** e os dois apps
  passam `'light'`. Ativar dark mode exige `'auto'` **e** ajustar o Tailwind (`darkMode: ['class']`
  e ninguém adiciona a classe hoje).
- A paleta da CSA está **espelhada** em `src/config.ts` e `src/index.css` — o CSS é o fallback
  que evita o flash antes do JS. Mexeu num, mexa no outro.

**De deploy** (as armadilhas que já custaram um deploy inteiro)
- `pm2 restart` **reusa o script da primeira subida** e ignora caminho novo. Por isso o script
  faz `pm2 delete` + `pm2 start`.
- `dotenv` **não reclama de path inexistente** — o boot seguia sem variável nenhuma e só
  estourava depois, no firebase-admin. Por isso `env.ts` procura o arquivo subindo e **falha
  dizendo o que faltou**.
- `@pedidos/core` é workspace e `npm install` não o resolve na VM: o deploy leva um **tarball**
  (`npm pack`) e reescreve a dep para `file:`. É `npm pack <caminho>`, **não** `npm --prefix`.
- **A verificação do motor cobre o `dist` inteiro, não um arquivo.** Até 2026-08-31 ela
  comparava só o sha de `dist/server/index.js`: mudança em `domain/` ou `ui/` passava com
  "motor confere" sem que nada daquilo fosse verificado (pegou o `fimDaAcolhida`). Agora é o
  sha da árvore — com `LC_ALL=C` no `sort` dos dois lados, senão a locale da sua máquina e a
  da VM ordenam diferente e a verificação falha em todo deploy por um motivo que não é o deploy.
- **O nome do arquivo de env tem que bater dos dois lados.** `env.ts` carrega `.env.production`
  (com `NODE_ENV=production`); o `deploy.sh` da CSA copiava para `.env` — o deploy atualizava um
  arquivo que o app nunca lê, e o boot pegava um `.env.production` obsoleto largado na VM.
  Sintoma: variável nova não chega e o erro só aparece no uso (foi assim que o
  `EVOLUTION_INSTANCE_NAME` sumiu e o login quebrou com 404 da Evolution em 2026-08-28).
  Corrigido nos dois apps; o `.env` velho entra no `rm` do deploy.

- **A VM não recebe mais as `devDependencies`.** Com `--omit=dev` o npm não as *instala*, mas o
  arborist ainda **resolve a árvore ideal delas** — em 2026-09-21 o deploy da CSA morreu em
  `npm install` com `Cannot read properties of null (reading 'edgesOut')` (npm 10.9.7 andando
  nos peers `vitest → jsdom → canvas`). Sem lock na VM a resolução é do zero, então o bug
  reaparece a cada mudança nesse pedaço da árvore. O `package.deploy.json` agora sai sem
  `devDependencies`. **Se o install quebrar no meio, produção fica sem
  `node_modules/@pedidos/core`**: o processo antigo continua de pé (módulos já em memória), mas
  qualquer restart derruba o app — terminar o deploy é urgente, não opcional.
- **O `deploy.sh` da CSA estava sem bit de execução no git** (`100644`; o do fermentou,
  `100755`). `./deploy.sh` respondia "permission denied". Corrigido em 2026-09-21.

## 6. Pendências, em ordem

1. ~~**Limpeza do legado da CSA**~~ — **feita em 2026-08-31**, 460 docs.
2. ~~**Aposentar os repos originais**~~ — **apagados em 2026-09-28**. Conferido arquivo a
   arquivo antes: o Fermentou não tinha nada fora do subtree, e as notas/segredos soltos da CSA
   foram para `apps/csa/private/` (gitignored).
3. **Apagar o backup** (`~/backup-csa-2026-08-21.json`, dados pessoais) — agora é o **único**
   rollback que existe. Só depois de algumas semanas de acolhida rodando redonda.
4. **WhatsApp dedicado para o Fermentou** (hoje divide o número da CSA; ver `~/repos/ZAP-PROTOCOL.md`).
5. **Pix pré-entrega** — decisão de produto antes de codar (`apps/fermentou/PENDENCIAS.md` B1/B2).
6. ~~**`.env.development`**~~ — **resolvido em 2026-09-12 para a CSA**: o arquivo existia no
   repo antigo (gitignored, não veio no subtree) e aponta para o Firebase **`pedidos-csa-dev`**,
   projeto separado. Copiado para `apps/csa/`. O Fermentou segue sem — mesmo caminho quando
   precisar.
7. ~~**Ligar o webhook de issues**~~ — **feito em 2026-08-30.** `/issue <texto>` no grupo
   `dev-csa` abre issue e o bot responde com o link (validado: issue #59). A entrada é
   compartilhada com o note-app pelo `zap-hub` (`~/repos/zap-hub`, ver `ZAP-PROTOCOL.md` §8).
   **O zap-hub não tem remote** — só existe nesta máquina.
8. **Redeploy do fermentou** — a produção dele é de **2026-08-22** e roda um core de antes do
   `fix(jobs)` de 31/08 (relógio do tenant nos jobs) e das correções de 21/09. Nada quebrado
   hoje — a oferta dele nasce do catálogo, não do parser —, mas o `sendOrdersJob` de lá ainda
   lê o relógio do processo (UTC). Um `./deploy.sh` em `apps/fermentou` resolve, e já sai com
   o `package.json` sem devDependencies.
9. **Renomear a infra do Fermentou na VM** (pm2, `/opt/pedidos-app`, nginx) para bater com o
   workspace, que virou `fermentou` em 2026-09-28. Procedimento pronto em **§4.1**.
10. **Backup offline das credenciais** — ver o aviso do topo: `apps/csa/private/` e os `.env`
    não têm mais segunda cópia em lugar nenhum.
11. **Isolamento por cliente + onboarding sem código novo** — questão em aberto, ver
   `ARQUITETURA.md` §5 "Questões em aberto" #3. Hoje o repo é **público** e um cliente novo
   custa ~6k linhas copiadas. Decisão adiada conscientemente em 2026-08-28: a solução tem que
   servir a N clientes, não ser um remendo pro Fermentou.

## 7. Riscos conhecidos

**Autorização — corrigida e em produção** (foi ao ar em 2026-08-21/28; o parágrafo fica como
histórico do que era). Até 2026-08-21 o engine confiava no
frontend: bastava estar autenticado para listar todos os membros (nome, e-mail, telefone,
endereço), editar produto de qualquer tenant, marcar a **própria fatura como paga** ou se
**promover a admin** via `PUT /users/me`. Era pré-existente (a "Pendência F3" do handoff antigo),
não veio da adoção do engine.

A regra está agora em `packages/core/src/server/auth.ts`, com 18 testes escritos como casos
negativos (`server/auth.test.ts`) — o tenant vem sempre do recurso, nunca do header.

⚠️ **A primeira tentativa de deploy NÃO levou a trava** e passou verde: o `npm install` na VM
respondeu "up to date" porque o tarball do core sempre se chamou `pedidos-core-0.1.0.tgz` — nome
e versão fixos, dependência considerada satisfeita. O `deploy.sh` agora **carimba o tarball com
timestamp**, apaga a cópia instalada antes de instalar e **compara o sha256** do
`@pedidos/core` da VM com o build local, falhando se divergir.

O que **não** está fechado: o escopo de fornecedor depende de `User.producerId` estar preenchido.
Usuário com `acesso: ['fornecedor']` e sem `producerId` não consegue editar nada — é o lado
seguro do erro, mas confira o cadastro antes de dar esse acesso a alguém.

## 8. Docs

| Doc | Para quê |
|---|---|
| `ARQUITETURA.md` | decisões, histórico fatia a fatia, roteiro da migração (§4.5) |
| `CLAUDE.md` | regras de trabalho, portão de verificação |
| `apps/*/BUSINESS_RULES.md` | regras de negócio de cada cliente |
| `apps/fermentou/PENDENCIAS.md` | decisões de produto em aberto |
| `apps/fermentou/MERGE.md` | mapa fork × CSA (histórico; os port-backs do §6 já entraram) |
| `apps/csa/definicoes_projeto.md` | referência da CSA — revisado em 2026-09-21 contra o código |
| `apps/fermentou/definicoes_projeto.md` | **desatualizado** — descreve o app antes do monorepo |
