# Regras de Negócio — pedidos-app

## Organização (Multi-tenancy)

> O tenant é a **organização**: coleção `tenants`, campo `tenantId`, header `x-tenant-id`.
> Na UI aparece pelo **nome** (`tenant.name`) — "padaria", "colmeia", etc. são exemplos de
> organização, não termos fixos no código.

- Todos os dados (usuários, produtos, pedidos, produtores) pertencem a uma organização via `tenantId`
- Superadmin acessa todas as organizações; admin e usuário comum só acessam a própria
- Seleção de organização ativa salva no `localStorage` do navegador
- Setup inicial cria a primeira organização via `POST /api/setup` (sem autenticação)
- Um usuário pode pertencer a apenas uma organização

## Usuários

### Categorias de acesso (`acesso: Acesso[]`)

`acesso` é uma **lista** — um usuário pode ter mais de uma categoria. Rótulos antigos são
normalizados na leitura (`user`→`consumidor`, `produtor`→`fornecedor`). Predicados são a fonte
única de checagem: `src/lib/acesso.ts` (front) e `server/services/acesso.ts` (back).

| Valor | Permissões |
|---|---|
| `consumidor` | Faz pedidos, envia comprovante, vê próprio histórico |
| `fornecedor` | Vê/edita **só o próprio contexto** (produtos, ofertas, pagamentos do seu `producerId`) |
| `admin` | Tudo + gerencia catálogo/ofertas/pedidos/pagamentos de **todos** os fornecedores |
| `superadmin` | Tudo de admin + acessa todas as organizações |

Regras:
- **`fornecedor` XOR `consumidor`** — mutuamente exclusivos no cadastro
- **`admin` sobrepõe `fornecedor`** — admin vê tudo, sem escopo
- `isAdmin` = tem `admin` ou `superadmin`. Fornecedor entra em Catálogo/Ofertas/Verificar Pagamentos (com escopo próprio); as demais telas admin exigem `admin`
- **Vínculo fornecedor**: `User.producerId` liga o usuário à entidade fornecedor do catálogo (por id, não por nome). Escopo hoje é no **frontend** (trava server-side pendente — ver PENDENCIAS F3)

### Administração — abas
- **Clientes**: só consumidores (admin/superadmin nunca aparecem)
- **Admins**: usuários com `admin`/`superadmin`
- **Fornecedores**: entidades do catálogo (`producers`)
- **Configurações**: cota, frete, vencimento, agenda
- **Organizações**: OFF por default (flag `MULTI_TENANT` em `src/lib/features.ts`); só aparece com multi-loja ligado

### Função no coletivo (`role`)
- Campo livre (`string`) que descreve a função do membro dentro do coletivo (ex: "tesoureiro", "coordenador")
- Gerenciado via coleção Firestore `roles` (por organização); sem valores padrão — o admin cria os seus (os defaults "colmeia"/"coagricultor" eram da CSA, removidos)
- Admin pode criar/deletar funções customizadas diretamente no formulário de edição de usuário
- Não afeta permissões de sistema — apenas informativo

### Outros campos de usuário
- `quota: 'Cota inteira' | 'Meia cota'` — define o valor da cota mensal; **obrigatório para elegibilidade** (usuário sem `quota` não tem cota gerada)
- `isentoCotas: boolean` — quando `true`, o usuário não tem cota mensal gerada e não aparece na lista de verificação de pagamentos de cota
- `disabled: boolean` — quando `true`, usuário inativo; excluído da geração de cotas
- `deleted: boolean` — quando `true`, usuário removido; excluído da geração de cotas
- `acolhidaExpiry: string (ISO date)` — data de encerramento do período de acolhida; ausente ou vazio = sem acolhida
- Usuário informa: nome, endereço, contato, frequência (semanal/quinzenal), tipo de retirada (na loja ou por entrega)

## Período de Acolhida

- Novos membros entram no período de acolhida de **30 dias** por padrão ao ser cadastrados (checkbox pré-marcado na criação)
- Campo `acolhidaExpiry` (ISO date, ex: `"2026-07-15"`) registra a data de encerramento
- Apenas informativo: não afeta pedidos, cotas, pagamentos nem permissões de sistema
- Admin pode ajustar a data ou remover o período via dialog de edição
- Badge exibido na lista de membros da AdminPage:
  - **Ativo** (`acolhidaExpiry >= hoje`): texto amarelo `"Acolhida até DD/MM"`
  - **Encerrado** (`acolhidaExpiry < hoje`): texto cinza `"Acolhida encerrada"`

## Catálogo de Produtos

- Produto possui: nome, unidade, preço, fornecedor, organização, tipo, situação
- **Tipo** (`type`): `fixo` = item do cardápio recorrente, cobrado via cota e **não pedido avulso**; `extra` = pedido avulso pelo cliente. Ausente = `extra`
- **Situação** (`ativo`): `false` = fora de linha — não entra em oferta nova, mas o histórico de pedidos e faturas é preservado. Ausente = ativo
- Preço editado na oferta → atualiza o preço no catálogo ao salvar
- Item adicionado à mão na oferta e inexistente no catálogo → criado automaticamente
- Produto pode ser editado ou removido pelo admin

### Produtores
- A organização é um fornecedor. Parcerias com outras produções entram como produtores adicionais
- A oferta da semana é publicada **por produtor**; o consolidado e as faturas também são por produtor

## Ofertas Semanais

- A oferta da semana é **gerada a partir do catálogo ativo** do produtor (`POST /api/offerings/from-catalog`), não de mensagem de produtor
- Admin pode ajustar os itens no formulário antes de salvar; itens fora do catálogo são criados nele
- Uma `WeeklyOffering` por produtor por semana (identificada por `weekStart` + `producerId`)
- Criar nova oferta para produtor+semana que já existe → **substitui** a existente (upsert), nunca duplica
- Item removido da oferta → descartado dos pedidos já feitos naquela semana
- Publicar uma oferta **reabre os extras** se estiverem encerrados

### Fallback semana anterior
- Produtor sem oferta na semana → copiar os itens da oferta anterior dele (`POST /api/offerings/fallback`)
- `weekStart`: data da segunda-feira da semana (ISO 8601)
- Campos preservados: `items[]`, `producerName` (denormalizado)

## Pedidos

- Um pedido por usuário por semana (`userId` + `weekId` únicos)
- Status: `rascunho` → `enviado`
- **Pedido é editável mesmo após ser enviado** (status `enviado` não bloqueia edição)
- O mesmo produto ofertado por produtores diferentes é **independente**: usuário pode pedir quantidades distintas de cada produtor
- Chave interna de quantidade: `offeringId + productId`
- Pedido consolidado (admin): soma de todos os pedidos da semana por produto, para envio ao produtor via WhatsApp

### Bloqueio de semana

- Após o envio do consolidado ao produtor via WhatsApp, a semana é **bloqueada** (`week_locks` no Firestore) — é o horário de corte do pedido
- Membros não-admin não podem criar nem editar pedidos em semana bloqueada (HTTP 403)
- Administradores podem criar e editar pedidos mesmo após o bloqueio
- O bloqueio ocorre tanto pelo envio manual (admin) quanto pelo **scheduler automático de terça-feira às 6h**
- Scheduler: envia para todos os fornecedores de todas as organizações que têm pedidos na semana; semanas sem pedidos não são bloqueadas

### Doação de cota

- Membro pode marcar sua cota semanal para doação em **Meus Pedidos** (campo `doacao: boolean` no pedido)
- Ao marcar doação: se não existir pedido para a semana, um é criado com `status: 'rascunho'` e `doacao: true`; extras já pedidos são **preservados**
- Membro marcado para doação é **removido** do planejamento de entrega (tela Entregas)
- Membro com doação aparece no **Consolidado Geral** com a coluna "Doação" marcada automaticamente

### Ordem da lista de entrega

- A lista de entrega (membros `deliveryType: 'entrega'`) pode ser reordenada manualmente pelo admin, arrastando — para sair na ordem que os motoboys usam
- A ordem é salva em `deliveryOrder` (número) por membro; **persiste entre semanas** e é **por organização** (o membro pertence a uma)
- Membro sem `deliveryOrder` (recém-cadastrado) aparece **no fim, em ordem alfabética**, até ser posicionado
- Reordenar numa semana em que um quinzenal não aparece **não altera** a posição relativa dele (o merge preserva os ocultos)
- O **texto de WhatsApp** dos motoboys segue essa mesma ordem
- Só vale para a lista de entrega; a lista de retirada na loja não é ordenável
- A lista de membros na **Administração** é sempre alfabética (não usa `deliveryOrder`)

### Consolidado Geral

- Tela administrativa que mostra **todos** os membros ativos da semana (tanto `entrega` quanto `retirada`)
- Respeita paridade quinzenal: membros que não recebem na semana não aparecem
- Colunas adicionais em relação à tela de Entregas:
  - **Doação**: marcado automaticamente se `order.doacao === true`
  - **Recebido**: checkbox clicável pelo admin, persiste no Firestore via `PATCH /api/orders/recebido`
- Se não houver pedido registrado para o membro e o admin marcar como recebido, um pedido mínimo é criado (`items: [], status: 'rascunho'`)

### Texto WhatsApp (Consolidado Extras)

- Cabeçalho: `*Nome da Organização — Semana de YYYY-MM-DD*` (nome vem de `tenant.name`)
- Nome do produtor e total de membros **não** são incluídos no texto gerado

## Frequência Quinzenal

- Usuários `semanal`: recebem itens fixos toda semana
- Usuários `quinzenal`: recebem itens fixos a cada duas semanas, conforme seu ciclo individual
- Extras estão disponíveis para todos independente da frequência
- Cada membro quinzenal tem `quinzenalParity: 'par' | 'impar'` definido no cadastro, derivado da data da última entrega informada no formulário
- As semanas são contadas de forma **contínua** a partir de uma âncora fixa (segunda-feira da semana ISO 1 de 2026): `impar` recebe nas semanas de índice par, `par` nas de índice ímpar
- Os nomes `par`/`impar` vêm da regra antiga, que derivava o ciclo do número da semana ISO. Não usar semana ISO para isso: a numeração reseta todo ano e, em ano de 53 semanas (2026, 2032...), a paridade repetiria na virada — um ciclo receberia duas semanas seguidas e o outro ficaria três sem receber
- A âncora não é arbitrária: é a única (mod 2) que preserva a escala que já vigorava, então a migração não mudou a semana de nenhum membro
- O que importa para o membro é **alternar de 2 em 2 semanas**, nunca o rótulo A/B
- Implementação: `isUserDeliveryWeek(user, weekStart)` em `src/lib/weekUtils.ts`; espelho no backend em `server/services/weekMath.ts` (duplicação sai no #18), mantidos em sincronia por `server/services/weekMath.test.ts`
- Na página de pedidos: itens fixos são ocultados quando não é a semana de entrega do usuário
- Na visão de entregas: quinzenais são excluídos da lista quando não é sua semana de entrega

## Pagamentos

- Uma fatura (`PaymentDoc`) por usuário **por produtor** por mês — chave única: `(userId, tenantId, month, producerName)`
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
- `dueDay` configurável pelo admin (padrão: 10); salvo em `tenant.dueDay`
- **Elegibilidade para geração de cota:** `quota` definido + `!isentoCotas` + `!disabled` + `!deleted`
  - Usuário sem campo `quota` → **não** tem cota gerada (campo obrigatório, definido pelo admin no cadastro)
  - Usuário com `isentoCotas: true` → não tem cota gerada; não aparece na lista de verificação
- **Geração automática:** cron job executa às 08h do dia 1 de cada mês (`server/jobs/quotaJob.ts`), gerando cotas para todos os elegíveis de todas as organizações
- `POST /payments/quota/all` permanece disponível para reprocessamento manual via API

### Frete da Entrega
- Fatura mensal (`producerName === 'Entrega'`) para membros que recebem por entrega (`deliveryType === 'entrega'`)
- Valor **por entrega**, não fixo mensal: `frete × countDeliveryWeeks(month, frequency, quinzenalParity)` — mesma contagem da cota, respeita quinzenal
- Frete efetivo = **override do membro** (`user.freteDelivery`) **ou** o **padrão da organização** (`tenant.freteDelivery`); `0` explícito é entrega grátis e vence o padrão (resolvido por `resolveFrete` em `server/services/freteMath.ts`)
- **Elegibilidade:** `deliveryType === 'entrega'` + `!disabled` + `!deleted` + frete efetivo `> 0` (frete 0 não gera fatura)
- Membro anexa comprovante e admin verifica — mesmo fluxo das outras faturas (reusa Firebase Storage via `useUploadProof`)
- Vencimento: dia `dueDay` do **mês seguinte** (pós-consumo, como extras)
- **Geração automática:** mesmo cron da cota (dia 1, 08h); `upsertPaymentsForOrder` nunca toca em `'Entrega'`
- `POST /payments/frete/all` disponível para reprocessamento manual via API; `POST /payments/frete` garante a fatura do próprio membro (auto-ensure ao abrir Meus Pagamentos)

---

## Herança da CSA ainda não decidida

Regras que vieram do fork e continuam ativas no código sem decisão de produto para o novo cliente:

- **Período de acolhida** (`acolhidaExpiry`): 30 dias para membro novo, apenas informativo
- **Frequência quinzenal** (`quinzenal` + `quinzenalParity`): cliente recebe a cada duas semanas
- **Doação de cota**: membro doa a cesta da semana e sai do planejamento de entrega
- **Função no coletivo** (`role`): campo livre, sem efeito em permissão

Nenhuma atrapalha a operação; todas viram dívida se ficarem sem dono.
