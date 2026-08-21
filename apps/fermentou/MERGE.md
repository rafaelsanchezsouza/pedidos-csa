> ℹ️ **Histórico** (2026-08-21). O merge aconteceu: o motor foi extraído para `packages/core` e
> os dois apps o consomem. Os port-backs do §6 (setup robusto, correções de deploy) **já
> entraram** — a CSA os herdou ao adotar o engine. Vale como mapa das divergências que existiam.

# Merge futuro: `pedidos-app` ⇄ `pedidos-csa`

Objetivo declarado: **remesclar o motor de backend** dos dois apps num só, multi-tenant,
com cada cliente (CSA, padaria, ...) como um tenant. Este doc mapeia o que diverge entre os
forks e, principalmente, **o que não concilia sem decisão ou migração de dados**.

Escopo: o merge é do **backend + modelo de dados**. Os frontends podem permanecer separados
(vocabulário e fluxo diferentes), então divergência de UI **não** entra na lista crítica.

> **Antes do merge, leia a §6 (Port-back).** Vários bugfixes e melhorias feitos no fork valem
> para o `pedidos-csa` **hoje**, independentemente do merge — alguns corrigem bugs latentes lá.

Contexto que torna isto sensível: `pedidos-csa` está **em produção com dados reais** (Firestore
com documentos já gravados) e **sem CI**. `pedidos-app` não tem dados ainda. Portanto, em todo
conflito de dado gravado, quem migra é a CSA, e migração em produção sem CI é a parte cara.

---

## 1. Conflitos INCONCILIÁVEIS sem migração de dados

Estes tocam **valores já gravados no Firestore da CSA**. Não há como o motor unificado ler os
dois formatos ao mesmo tempo sem um passo de migração ou uma camada de compatibilidade.

| # | O quê | CSA (produção) | pedidos-app | Resolução |
|---|---|---|---|---|
| 1 | **Identificador do tenant** | campo `colmeiaId` em todos os docs; coleção `colmeias` | campo `tenantId`; coleção `tenants` | Migrar os docs da CSA (renomear campo + copiar coleção) **ou** o motor aceitar os dois nomes num período de transição. Decisão de nome é irreversível na prática (chave de query). |
| 2 | **Header HTTP de contexto** | `x-colmeia-id` | `x-tenant-id` | Middleware aceitar ambos durante a transição; depois fixar um. |
| 3 | **Rotas REST** | `/api/colmeias` | `/api/tenants` | Manter alias temporário; frontends apontam para o novo. |
| 4 | **localStorage** | `colmeia_{uid}` | `tenant_{uid}` | Cosmético (recriado no próximo login), mas os dois frontends divergem. |
| 5 | **`deliveryType`** (valor gravado) | `'colmeia' \| 'entrega'` | `'retirada' \| 'entrega'` | Migrar os users da CSA (`'colmeia'` → `'retirada'`) **ou** o motor tratar os dois como sinônimos de "retirada". **Atenção:** `paymentService`/`freteMath` ramificam por este valor. |

> **Por que não dá pra adiar a #1 e #5:** são chaves de leitura. Um motor único que faça
> `where('tenantId','==',x)` **não acha** os docs da CSA gravados com `colmeiaId`. Ou migra, ou
> a camada de acesso a dados lê os dois nomes. É a decisão estrutural do merge.

---

## 2. Divergências de comportamento a reconciliar (sem migração de dado)

| # | O quê | CSA | pedidos-app | Como unir |
|---|---|---|---|---|
| 6 | **Origem da oferta** | parsing de mensagem de produtor (WhatsApp) → `parseMessage` (fuzzy/openai) | gerada do catálogo (`POST /offerings/from-catalog`) | Ambas chamam o mesmo `upsertOffering`. São **dois pontos de entrada**, não um conflito — manter os dois no motor, disponível por tenant. |
| 7 | **`parseMessage` + dep `openai`** | núcleo do fluxo CSA (produtor manda cardápio por texto) | **removido** | O motor unificado **precisa manter** `parseMessage` (a CSA depende). Para a padaria fica inativo. Reverter a remoção no lado do motor. |
| 8 | **Campos de `Product`** | sem `type`/`ativo` | tem `type` (fixo/extra) e `ativo` (fora de linha) | Aditivos e opcionais → manter no modelo unificado; CSA ignora se não usar. |
| 9 | **Funções padrão de `role`** | seeda `'colmeia'` e `'coagricultor'` (não deletáveis) | sem defaults (campo livre) | Tornar os defaults **config por tenant**. Ver §4. |
| 11 | **Modelo de `acesso`** | valor único (`'admin'\|'user'\|'superadmin'\|'produtor'`) | **lista** (`superadmin\|admin\|consumidor\|fornecedor`)[] + fornecedor XOR consumidor + `User.producerId` | Migrar users da CSA para lista e normalizar rótulos (`user`→`consumidor`, `produtor`→`fornecedor`). Predicados já normalizam string legada, então leitura é retrocompatível. Ver Port-back §6.4. |

---

## 3. Divergência que ainda não existe em código, mas vai conflitar (F3)

| # | O quê | CSA | pedidos-app (planejado) |
|---|---|---|---|
| 10 | **Modelo de cobrança** | fatura **mensal, pós-consumo** (cota/extras/frete), comprovante + verificação | **Pix por pedido, pré-entrega** (F3) | O motor de pagamentos vira **estratégia plugável** (mensal-pós × por-pedido-pré) gravando na mesma coleção `payments`. Desenhar `payments` para suportar as duas **antes** de F3, senão o merge fica mais caro. |

---

## 4. `role` (função no coletivo) — nota específica

Pedido do usuário: registrar que numa padaria a `role` seria "consumidor" ou similar.

- Na CSA, `role` distingue funções com peso real no coletivo: `coagricultor` (co-divide o
  risco agrícola), `colmeia` (ponto de retirada), `tesoureiro`. É informação de negócio.
- Numa padaria, "consumidor" é essencialmente **o próprio cliente** — a `role` colapsa e vira
  quase redundante com o nível de acesso `user`/Cliente.
- **Decisão tomada no fork:** defaults removidos, campo 100% livre (`DEFAULTS = []` em
  `server/routes/roles.ts`). O admin de cada tenant cria os seus.
- **Para o merge:** transformar os defaults em **config por tenant** (ex: `tenant.roleDefaults`),
  para a CSA recuperar `colmeia`/`coagricultor` e a padaria usar `consumidor` (ou nenhum) sem
  hardcode no motor. Alternativa mais radical: avaliar se `role` faz sentido para tenants de
  varejo — pode ser feature só-CSA.

---

## 5. O que é seguro (reaproveitado sem divergir)

Idêntico nos dois, não gera conflito de merge — só a duplicação física a eliminar:

- Cálculo de semana / ciclo quinzenal: `weekUtils.ts` (client) + `weekMath.ts` (server)
- `freteMath.ts`, `statusPagamento.ts`, `deliveryOrder.ts`
- Motor de faturas mensais (`paymentService.ts`, `quotaJob.ts`) — enquanto for mensal-pós
- Auth + multi-tenancy (a plumbing; o conflito é só o **nome** do campo, §1)
- `PageHeader` e o kit de UI

Estes são os candidatos naturais a virar o núcleo compartilhado no merge. A regra de data/fuso
**já quebrou 3x** e é o maior motivo pra unificar (hoje são 4 cópias: 2 apps × client/server).

---

## 6. Port-back: melhorias do fork para o `pedidos-csa`

Mudanças feitas no fork que **não são específicas de padaria** e valem para o CSA **agora**,
sem esperar o merge. Ordenadas por relação valor/risco. Confirmado por leitura do código do
CSA em 2026-07-21.

| # | Melhoria (commit no fork) | Estado no CSA hoje | Valor | Risco de portar |
|---|---|---|---|---|
| 6.1 | **OTP usa o nome do tenant** — `getTenantName()` em `whatsappAuth.ts` | Hardcoded `"Seu código de acesso ao Pedidos CSA"` | Correção de marca; trivial | Baixo — troca de 1 string por lookup |
| 6.2 | **`/api/setup` cria o doc do admin** (+ parametriza o nome) | Fixa `"Flor de Quilombo"` e **NÃO cria** o doc do admin em `users` → 1º login daria 404 em `/users/me` | Corrige **bug latente** de first-run; útil pra novas colmeias | Baixo — CSA já rodou o setup, então é aditivo |
| 6.3 | **deploy robusto**: copia env como `.env.production` + sobe pm2 com `NODE_ENV=production` | Copia como `.env` e sobe pm2 **sem** `NODE_ENV`; `env.ts` procura `.env.production` só em produção → prod funciona por env salvo no dump do pm2 (**frágil**) | Alto — deploy deixa de depender de estado invisível do pm2 | **Médio — testar com cuidado**: o prod da CSA funciona hoje pelo dump; validar antes de confiar |
| 6.4 | **`acesso` multi-categoria + predicados** (`src/lib/acesso.ts`, `server/services/acesso.ts`) | valor único; checagens espalhadas (`acesso === 'admin'`...) | Médio — permite admin+fornecedor, centraliza permissão | Médio — mexe em todo check; predicados normalizam string legada, então migração de dados é opcional/gradual |
| 6.5 | **Escopo de fornecedor por id** (`User.producerId`, não por nome) | `produtor` na CSA escopa por **nome** (`producerName === user.name`) — frágil (F2) | Médio — robustez do escopo do produtor | Baixo-médio — aditivo; precisa vincular os produtores existentes a um `producerId` |

**Não portar** (divergência de domínio, ver §2): remoção do `parseMessage`, `from-catalog`,
colapso de fornecedor/organização quando único, rename `colmeia`→`tenant`, camada de brand.
Esses são a personalidade da padaria, não melhorias do motor.

Como portar: `git cherry-pick` **não** vale mais (identificadores divergiram, §1). Fazer à mão,
traduzindo `tenant`→`colmeia` / `tenantId`→`colmeiaId` / `consumidor`→`user` / `fornecedor`→
`produtor` no caminho. São mudanças pequenas e localizadas (exceto 7.3/7.4).

---

## 7. Ordem sugerida para o merge

1. Decidir o nome do identificador (§1.1) — tudo depende disso.
2. Camada de acesso a dados que leia `colmeiaId` **e** `tenantId` (transição sem downtime).
3. Migrar os docs da CSA (`colmeiaId`→`tenantId`, `deliveryType 'colmeia'`→`'retirada'`).
4. Reintroduzir `parseMessage` no motor como capacidade opcional por tenant (§2.7).
5. `role` defaults → config por tenant (§4).
6. Extrair o cálculo puro (§5) para um pacote único consumido pelos dois.
7. Só então desenhar o motor de pagamentos plugável, antes de F3 (§3).

Passos 1–3 são o coração e exigem migração de produção sem CI — planejar com backup e janela.
