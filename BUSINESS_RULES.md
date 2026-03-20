# Regras de Negócio — pedidos-csa

## Colmeia (Multi-tenancy)

- Todos os dados (usuários, produtos, pedidos, produtores) pertencem a uma colmeia via `colmeiaId`
- Superadmin acessa todas as colmeias; admin e usuário comum só acessam a própria
- Seleção de colmeia ativa salva no `localStorage` do navegador
- Setup inicial cria a primeira colmeia via `POST /api/setup` (sem autenticação)
- Um usuário pode pertencer a apenas uma colmeia

## Usuários e Roles

| Role | Acesso |
|---|---|
| `user` | Faz pedidos, envia comprovante, vê próprio histórico |
| `admin` | Tudo de user + gerencia catálogo, parsing de ofertas, consolida pedidos, verifica pagamentos |
| `superadmin` | Acessa todas as colmeias |
| `produtor` | (futuro) acesso específico para produtores |

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

## Frequência Quinzenal

- Usuários `semanal`: recebem itens fixos toda semana
- Usuários `quinzenal`: recebem itens fixos apenas em **semanas ISO ímpares** (1, 3, 5...)
- Extras estão disponíveis para todos independente da frequência
- Implementação: `isFixoWeek(weekStart) = getISOWeekNumber(weekStart) % 2 === 1`
- Na página de pedidos: itens fixos são ocultados para quinzenais em semanas pares
- Na visão de entregas: quinzenais são excluídos da lista em semanas sem fixo

## Pagamentos

- Uma fatura (`PaymentDoc`) por usuário **por produtor** por mês — chave única: `(userId, colmeiaId, month, producerName)`
- Fatura criada/atualizada automaticamente ao salvar pedido com `status: 'enviado'`
- Valor recalculado a partir de todos os pedidos `enviado` do usuário no mês, somando itens por produtor
- Se pedido for alterado (inclusive de volta para `rascunho`), todos os PaymentDocs do usuário/mês são recalculados
- `producerName` é denormalizado no `OrderItem` no momento do pedido — necessário para agrupamento correto
- Usuário envia comprovante por fatura (por produtor) → URL armazenada em `proofUrl` da fatura específica
- Admin verifica cada fatura individualmente → marca `verified: true`; outras faturas do mesmo usuário não são afetadas
- Mês representado como string `"YYYY-MM"`
- Dados históricos (orders anteriores à adição de `producerName` no `OrderItem`) não são migrados; itens sem `producerName` são agrupados sob `"(sem produtor)"`
