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
- Preço deve ser atualizado quando produtor informar novo valor
- Ao fazer parsing de mensagem: verificar via OpenAI se produto já existe no catálogo (variações de escrita, abreviações)
- Se produto novo for identificado no parsing → adicionar ao catálogo
- Produto pode ser editado ou removido pelo admin

## Parsing de Mensagens de Produtores (OpenAI)

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
- Matching com catálogo: fuzzy (variações ortográficas, abreviações) via OpenAI
- Se `matchedProductId` retornado → item vinculado ao produto existente no catálogo

### Fallback semana anterior
- Se não houver oferta de um produtor até o momento de geração das ofertas semanais → usar itens da semana anterior para esse produtor

## Ofertas Semanais

- Admin faz parsing da mensagem → revisa resultado → salva como `WeeklyOffering`
- Uma `WeeklyOffering` por produtor por semana (identificada por `weekStart` + `producerId`)
- `weekStart`: data da segunda-feira da semana (ISO 8601)
- Campos preservados: `rawMessage` (original), `items[]` (parseados), `producerName` (denormalizado)

## Pedidos

- Um pedido por usuário por semana (`userId` + `weekId` únicos)
- Status: `rascunho` → `enviado`
- **Pedido é editável mesmo após ser enviado** (status `enviado` não bloqueia edição)
- Pedido consolidado (admin): soma de todos os pedidos da semana por produto, para envio ao produtor via WhatsApp

## Frequência Quinzenal

- Usuários `semanal`: recebem itens fixos toda semana
- Usuários `quinzenal`: recebem itens fixos apenas em **semanas ISO ímpares** (1, 3, 5...)
- Extras estão disponíveis para todos independente da frequência
- Implementação: `isFixoWeek(weekStart) = getISOWeekNumber(weekStart) % 2 === 1`
- Na página de pedidos: itens fixos são ocultados para quinzenais em semanas pares
- Na visão de entregas: quinzenais são excluídos da lista em semanas sem fixo

## Pagamentos

- Relatório mensal: individual (por usuário) e consolidado (admin)
- Usuário envia comprovante → armazenado como URL (`proofUrl`) no Firebase Storage
- Admin verifica pagamento → marca `verified: true`
- Mês representado como string `"YYYY-MM"`
