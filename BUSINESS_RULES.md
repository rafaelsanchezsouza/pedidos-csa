# Regras de Negócio — pedidos-csa

## Colmeia (Multi-tenancy)

- Todos os dados (usuários, produtos, pedidos, produtores) pertencem a uma colmeia via `colmeiaId`
- Superadmin acessa todas as colmeias; admin e usuário comum só acessam a própria
- Seleção de colmeia ativa salva no `localStorage` do navegador
- Setup inicial cria a primeira colmeia via `POST /api/setup` (sem autenticação)
- Um usuário pode pertencer a apenas uma colmeia

## Usuários

### Nível de acesso (`acesso`)

| Valor | Permissões |
|---|---|
| `user` | Faz pedidos, envia comprovante, vê próprio histórico |
| `admin` | Tudo de user + gerencia catálogo, parsing de ofertas, consolida pedidos, verifica pagamentos |
| `superadmin` | Acessa todas as colmeias |
| `produtor` | Acessa verificação de pagamentos dos próprios produtos |

### Função no coletivo (`role`)
- Campo livre (`string`) que descreve a função do membro dentro do coletivo (ex: "colmeia", "coagricultor", "tesoureiro")
- Gerenciado via coleção Firestore `roles` (por colmeia), com dois valores padrão não deletáveis: **"colmeia"** e **"coagricultor"**
- Admin pode criar/deletar funções customizadas diretamente no formulário de edição de usuário
- Não afeta permissões de sistema — apenas informativo

### Outros campos de usuário
- `quota: 'Cota inteira' | 'Meia cota'` — define o valor da cota mensal; **obrigatório para elegibilidade** (usuário sem `quota` não tem cota gerada)
- `isentoCotas: boolean` — quando `true`, o usuário não tem cota mensal gerada e não aparece na lista de verificação de pagamentos de cota
- `disabled: boolean` — quando `true`, usuário inativo; excluído da geração de cotas
- `deleted: boolean` — quando `true`, usuário removido; excluído da geração de cotas
- Usuário informa: nome, endereço, contato, frequência (semanal/quinzenal), tipo de retirada (na colmeia ou por entrega)

## Catálogo de Produtos

- Produto possui: nome, unidade, preço, produtor, colmeia
- Matching com catálogo: **inferência fuzzy local** (distância de Levenshtein), não OpenAI (OpenAI disponível mas inativo)
- Preço ausente na mensagem + produto matched → preencher com preço do catálogo
- Preço discriminado na oferta → atualizar preço no catálogo ao salvar oferta
- Produto não existente no catálogo ao salvar oferta → criar automaticamente (nome, unidade, preço, produtor)
- Produto pode ser editado ou removido pelo admin

## Parsing de Mensagens de Produtores

### Geraldo
- Mensagem contém **somente extras** com preço
- Formato livre, exemplos de variação: `"Alface crespa (unid) R$3.50"`, `"Cebolinha  2.5"`, `"Mamão (kg)5.00"`
- Todos os itens são classificados como `type: 'extra'`
- Indicador: mensagem começa com "Boa tarde Extra" ou similar

### Edilson Jucy
- Mensagem contém **dois blocos**:
  1. "Os alimentos disponível" → cota fixa semanal (`type: 'fixo'`), **sem preço informado**
  2. "Os alimentos estra" (sic) → extras (`type: 'extra'`), **sem preço informado**
- Como não há preço na mensagem de Edilson Jucy, usar preço do catálogo existente
- Indicador: mensagem começa com "Bom dia" e contém "alimentos disponível"

### Regras gerais de parsing
- `type: 'fixo'` → keywords: "alimentos disponível", "cota", "fixo"
- `type: 'extra'` → keywords: "extra", "estra", "disponível extra"
- Preço ausente → default `0` (a ser preenchido manualmente ou buscado no catálogo)
- Unidade ausente → default `"unid"`
- Matching com catálogo: fuzzy local (Levenshtein); OpenAI disponível como alternativa via `server/services/parseMessage/index.ts`
- Se `matchedProductId` retornado → item vinculado ao produto existente no catálogo

### Fallback semana anterior
- Se não houver oferta de um produtor até o momento de geração das ofertas semanais → usar itens da semana anterior para esse produtor

## Ofertas Semanais

- Admin faz parsing da mensagem → revisa resultado → salva como `WeeklyOffering`
- Uma `WeeklyOffering` por produtor por semana (identificada por `weekStart` + `producerId`)
- Criar nova oferta para produtor+semana que já existe → **substitui** a existente (upsert), nunca duplica
- `weekStart`: data da segunda-feira da semana (ISO 8601)
- Campos preservados: `rawMessage` (original), `items[]` (parseados), `producerName` (denormalizado)

## Pedidos

- Um pedido por usuário por semana (`userId` + `weekId` únicos)
- Status: `rascunho` → `enviado`
- **Pedido é editável mesmo após ser enviado** (status `enviado` não bloqueia edição)
- O mesmo produto ofertado por produtores diferentes é **independente**: usuário pode pedir quantidades distintas de cada produtor
- Chave interna de quantidade: `offeringId + productId`
- Pedido consolidado (admin): soma de todos os pedidos da semana por produto, para envio ao produtor via WhatsApp

### Doação de cota

- Membro pode marcar sua cota semanal para doação em **Meus Pedidos** (campo `doacao: boolean` no pedido)
- Ao marcar doação: se não existir pedido para a semana, um é criado com `status: 'rascunho'` e `doacao: true`; extras já pedidos são **preservados**
- Membro marcado para doação é **removido** do planejamento de entrega (tela Entregas)
- Membro com doação aparece no **Consolidado Geral** com a coluna "Doação" marcada automaticamente

### Consolidado Geral

- Tela administrativa que mostra **todos** os membros ativos da semana (tanto `entrega` quanto `colmeia`)
- Respeita paridade quinzenal: membros que não recebem na semana não aparecem
- Colunas adicionais em relação à tela de Entregas:
  - **Doação**: marcado automaticamente se `order.doacao === true`
  - **Recebido**: checkbox clicável pelo admin, persiste no Firestore via `PATCH /api/orders/recebido`
- Se não houver pedido registrado para o membro e o admin marcar como recebido, um pedido mínimo é criado (`items: [], status: 'rascunho'`)

### Texto WhatsApp (Consolidado Extras)

- Cabeçalho: `*Nome da Colmeia — Semana de YYYY-MM-DD*` (nome vem de `colmeia.name`)
- Nome do produtor e total de membros **não** são incluídos no texto gerado

## Frequência Quinzenal

- Usuários `semanal`: recebem itens fixos toda semana
- Usuários `quinzenal`: recebem itens fixos a cada duas semanas, conforme seu ciclo individual
- Extras estão disponíveis para todos independente da frequência
- Cada membro quinzenal tem `quinzenalParity: 'par' | 'impar'` definido no cadastro, derivado da data da última entrega informada no formulário
- `impar` = recebe em semanas ISO ímpares (1, 3, 5...); `par` = recebe em semanas ISO pares (2, 4, 6...)
- Implementação: `isUserDeliveryWeek(user, weekStart)` em `src/lib/weekUtils.ts`
- Na página de pedidos: itens fixos são ocultados quando não é a semana de entrega do usuário
- Na visão de entregas: quinzenais são excluídos da lista quando não é sua semana de entrega

## Pagamentos

- Uma fatura (`PaymentDoc`) por usuário **por produtor** por mês — chave única: `(userId, colmeiaId, month, producerName)`
- Mês representado como string `"YYYY-MM"`
- Usuário envia comprovante por fatura → URL em `proofUrl`; admin verifica → `verified: true`

### Extras (pedidos semanais)
- Fatura criada/atualizada automaticamente ao salvar pedido com `status: 'enviado'`
- Valor = soma de `(price × qty)` por produtor em todos os pedidos `enviado` do mês
- Se pedido for alterado (inclusive de volta para `rascunho`), PaymentDocs do usuário/mês são recalculados; se amount zerar, documento permanece
- `producerName` é denormalizado no `OrderItem` no momento do pedido
- `upsertPaymentsForOrder` nunca toca em pagamentos com `producerName === 'Cota'`
- Vencimento: dia `dueDay` do **mês seguinte** (pagamento pós-consumo)

### Cota mensal
- `producerName === 'Cota'`; criada via `POST /payments/quota` (por usuário) ou `POST /payments/quota/all` (admin, gera para todos elegíveis)
- `quotaInteira` e `quotaMeia` são valores **por semana** (ex: R$65/semana cota inteira)
- Valor mensal = `weeklyRate × countDeliveryWeeks(month, user.frequency, user.quinzenalParity)`
  - Usuário `semanal`: conta todas as quartas-feiras do mês
  - Usuário `quinzenal`: conta apenas as semanas do ciclo do membro
- Vencimento: dia `dueDay` do **mês anterior** (pagamento pré-consumo)
- `dueDay` configurável pelo admin (padrão: 10); salvo em `colmeia.dueDay`
- **Elegibilidade para geração de cota:** `quota` definido + `!isentoCotas` + `!disabled` + `!deleted`
  - Usuário sem campo `quota` → **não** tem cota gerada (campo obrigatório, definido pelo admin no cadastro)
  - Usuário com `isentoCotas: true` → não tem cota gerada; não aparece na lista de verificação
- **Geração automática:** cron job executa às 08h do dia 1 de cada mês (`server/jobs/quotaJob.ts`), gerando cotas para todos os elegíveis de todas as colmeias
- `POST /payments/quota/all` permanece disponível para reprocessamento manual via API
