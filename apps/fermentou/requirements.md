# Visão Geral

Motor genérico de gestão de pedidos e entregas, multi-tenant. Cada **organização** (tenant)
tem seu catálogo, seus clientes e suas entregas. O cliente interage **principalmente pelo
WhatsApp**; a web é a ferramenta do admin da organização.

Primeiro cliente: uma **padaria** (catálogo próprio e estável, cardápio recorrente + extras).
Fork de `pedidos-csa` (Rede CSA Parahyba) — a intenção é **remesclar o motor de backend** com
a CSA no futuro, por isso os nomes são mantidos genéricos (`tenant`, não `padaria`/`colmeia`).

---

# Fases de Implementação

## F0 — Fork e generalização ✅
- Clone com histórico, `origin` removido, porta 3004 na VM
- Parsing de mensagem de produtor removido (`parseMessage`, dep `openai`)
- Oferta da semana passa a ser gerada do catálogo (`POST /api/offerings/from-catalog`)
- Produto ganha `type` (fixo/extra) e `ativo` (fora de linha)
- Múltiplos fornecedores mantidos — parcerias com outras produções
- Vocabulário e identificadores generalizados: `colmeia`→`tenant`, marca via `APP_NAME`

## F1 — Operação web ⬜
- Catálogo, oferta semanal, pedidos de extras
- Lista de entrega com ordenação manual (herdada, funcional)
- Faturas: cota mensal + extras + frete

## F2 — WhatsApp como interface principal ⬜
- Adaptador `zap-in/1` inbound + gateway outbound (ver `~/repos/ZAP-PROTOCOL.md`)
- **Instância dedicada** (número próprio) — bot fala com terceiros
- Auto-cadastro do cliente pelo WhatsApp, com **aprovação do admin** antes de começar a receber
- Menu conversacional: ver cardápio, pedir extra, consultar fatura

## F3 — Pix ⬜
- Chave estática + comprovante (fluxo já existente), pagamento **pré-entrega**
- Cobrança por pedido, não só fatura mensal

---

# Funcionalidades

## Catálogo
- Produto: nome, unidade, preço, fornecedor, tipo (fixo/extra), ativo
- Produto **fixo** é cobrado via cota, não entra em pedido avulso
- Produto **extra** é pedido avulso pelo cliente
- Produto fora de linha (`ativo: false`) some da oferta sem apagar o histórico

## Oferta da Semana
- Gerada a partir do catálogo ativo, por fornecedor
- Admin pode ajustar itens antes de publicar
- Fallback: copiar a oferta da semana anterior

## Pedidos
- Um pedido por cliente por semana; editável enquanto a semana não estiver travada
- Consolidado por fornecedor para envio via WhatsApp

## Entrega
- Lista da semana com ordenação manual (arrastar) para a rota do motoboy
- Ordem persiste entre semanas

## Financeiro
- Cota mensal (pedido fixo não é registrado, só cobrado)
- Extras por pedido
- Frete por entrega
- Comprovante enviado pelo cliente, verificado pelo admin

## Acesso
- Web: apenas admin da organização (por enquanto)
- Cliente: WhatsApp, identificado por telefone

---

# Herança da CSA

Reaproveitado quase intacto: auth + multi-tenancy, cálculo de semana/ciclo quinzenal,
motor de faturas/cotas, lista de entrega, `PageHeader` e o kit de UI, `deploy.sh`.

O tenant se chama `tenantId` (coleção `tenants`) em vez do `colmeiaId` da CSA. Como o plano é
**remesclar o backend** com o `pedidos-csa`, os nomes foram generalizados agora, aceitando que
o `git cherry-pick` entre os forks deixa de funcionar — a reconciliação vai acontecer no merge,
não via cherry-pick. O cálculo de data/fuso duplicado (`weekUtils`/`weekMath`) é o principal
candidato a unificar nesse merge.
