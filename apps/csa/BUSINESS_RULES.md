# Regras de Negócio — pedidos-csa

## Colmeia (Multi-tenancy)

- Todos os dados (usuários, produtos, pedidos, produtores) pertencem a uma colmeia via `tenantId`
  (a coleção é `tenants`; **"colmeia" é o vocabulário de tela**, o modelo é canônico desde a
  migração de 2026-08-21 — o `colmeiaId` legado ainda existe ao lado até a limpeza)
- Superadmin acessa todas as colmeias; admin e usuário comum só acessam a própria
- Seleção de colmeia ativa salva no `localStorage` do navegador
- Setup inicial cria a primeira colmeia via `POST /api/setup` (sem autenticação, e **bloqueado
  assim que existir qualquer tenant** — roda uma vez só)
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
- `quotaQty: number` — quantidade de cotas **do mesmo tipo** (padrão 1). Ex: membro que recebe 2 cotas inteiras (`quota: 'Cota inteira'`, `quotaQty: 2`) ou 3 meias (`quota: 'Meia cota'`, `quotaQty: 3`). Ausente = 1 (retrocompatível). Não permite misturar inteira+meia no mesmo membro (usar dois cadastros)
- `isentoCotas: boolean` — quando `true`, o usuário não tem cota mensal gerada e não aparece na lista de verificação de pagamentos de cota
- `disabled: boolean` — quando `true`, usuário inativo; excluído da geração de cotas
- `deleted: boolean` — quando `true`, usuário removido; excluído da geração de cotas
- `acolhidaExpiry: string (ISO date)` — data de encerramento do período de acolhida; ausente ou vazio = sem acolhida
- Usuário informa: nome, endereço, contato, frequência (semanal/quinzenal), tipo de retirada (na colmeia ou por entrega)
- `neighborhood` (bairro) **só o admin altera**: ele define o preço do frete, e quem paga não pode escolher o próprio valor trocando de bairro. Saiu de `CAMPOS_DO_PROPRIO_PERFIL`

## Período de Acolhida

- Novos membros entram no período de acolhida de **30 dias** por padrão — checkbox pré-marcado **tanto no cadastro avulso quanto no import por CSV**; desmarcar é a exceção (membro que já é de casa)
- A data de encerramento sai de `fimDaAcolhida` (motor), no fuso do tenant — os dois caminhos usam a mesma conta
- No import por CSV, a acolhida conta **30 dias a partir da 1ª entrega informada** no formulário (coluna 11), não do dia da importação; sem data, conta de hoje
- Campo `acolhidaExpiry` (ISO date, ex: `"2026-07-15"`) registra a data de encerramento; vale **até o fim** desse dia, no fuso do tenant
- **Cobrança é por semana confirmada, não pelo mês** (desde 2026-08-30): quem está em acolhida experimenta a CSA pagando só o que vai consumir, em vez de assinar o mês adiantado
  - O membro **confirma a semana** ("desejo receber esta semana") na tela principal
  - Prazo: **segunda-feira até 23h59** no fuso do tenant (antes do pedido consolidado ir ao produtor)
  - Não confirmou → não entra na lista de entrega, não entra no pedido ao produtor, não gera valor
  - Cota do mês = `valor semanal × quotaQty × semanas confirmadas`
  - Frete = `frete × semanas confirmadas`, para quem recebe em casa — **elegibilidade inalterada**: segue `isEntrega(u)`, o `deliveryType` do próprio membro
  - **`deliveryType` continua sendo do usuário**, não da semana: o membro em acolhida troca o dele pela tela principal, como qualquer outro membro. A acolhida muda *quantas semanas contam*, não *como ele recebe*
  - Faturas da acolhida **não têm vencimento** (`dueDate` ausente): o membro anexa o comprovante da semana
  - Quem recebe em casa tem **duas** faturas na semana (cota e delivery) e anexa **uma por
    fatura**, cada uma com seu bloco na tela. Até 2026-10-02 a tela só oferecia o anexo da
    cota, e a fatura de frete — gerada junto, na confirmação — não tinha onde receber
    comprovante. Sem fatura de frete (frete zero, ou retirada) o bloco não aparece
  - Encerrada a acolhida, volta à cobrança mensal cheia automaticamente
- **Tela inicial**: quem está em acolhida cai em `/acolhida` ao entrar, com as duas ações de prazo na frente (confirmar a semana e anexar o comprovante) e o tique de retirada/entrega. O menu segue completo — ele está decidindo se fica, e esconder ofertas e pedidos seria esconder o que ele veio conhecer
- Item **"Minha Semana"** aparece na navegação enquanto a acolhida está aberta; some quando encerra
- **Extras (pedidos) ficam indisponíveis durante a acolhida**: o pedido é só a cesta da semana. Barrado nos dois lados — item some do menu e a rota `/pedidos` redireciona para `/acolhida`, e o servidor recusa `POST`/`PUT` de pedido com 403 (`routes/orders.ts`). Admin não é afetado. Encerrada a acolhida, volta sozinho
- **Lista de entregas**: membro em acolhida só aparece na semana que confirmou. Falha ao carregar as confirmações **não** esconde ninguém (volta ao comportamento antigo — o lado seguro do erro)
- **Conferência**: fatura com vários comprovantes ganha seletor de semana (com a data da entrega); com um só, segue link direto
- Registro: coleção `acolhidaWeeks`, chave `(userId, tenantId, weekId)`, só com a confirmação; `confirmado: false` distingue "disse que não" de "não respondeu"
- Permissões de sistema: inalteradas (acolhida não muda acesso)
- Admin pode ajustar a data ou remover o período via dialog de edição
- Badge exibido na lista de membros da AdminPage:
  - **Ativo** (`acolhidaExpiry >= hoje`): texto amarelo `"Acolhida até DD/MM"`
  - **Encerrado** (`acolhidaExpiry < hoje`): texto cinza `"Acolhida encerrada"`

## Catálogo de Produtos

- Produto possui: nome, unidade, preço, produtor, colmeia
- Matching com catálogo: **inferência fuzzy local** (distância de Levenshtein), não OpenAI (OpenAI disponível mas inativo)
- A regra do match é **uma só** (`melhorMatch`, em `packages/core/src/domain/matchProduto.ts`, limiar 0.7): o servidor a usa ao gerar a oferta e a tela ao reconferir um nome corrigido. Duas implementações dariam feedback mentiroso na tela
- O catálogo consultado é sempre o **do produtor** da oferta, nunca o da colmeia inteira
- Preço (ou unidade) ausente na mensagem + produto matched → preencher com o do catálogo
- Preço discriminado na mensagem **vence o do catálogo** e, ao salvar a oferta, atualiza o catálogo. Até 2026-09-21 o `/parse` sobrescrevia sempre pelo catálogo: preço novo do produtor nunca chegava à oferta
- Unidade segue a mesma regra do preço: o parser devolve `''` quando o produtor não informou (não chuta `unid`), o catálogo preenche quando o item casa, e só na gravação um produto **novo** sem unidade vira `unid`. Antes o chute `unid` virava a unidade do catálogo de cabeça (um `maço` virava `unid` ao salvar)
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
- Preço ausente → `0`; unidade ausente → `''`. Os dois são **sinal de "não informado"**, resolvidos por quem chama (catálogo, tela, ou o default `unid` na gravação) — o parser não chuta
- Matching com catálogo: fuzzy local (Levenshtein), no core; OpenAI disponível como alternativa (`capabilities.messageParser='openai'` + adapter `server/services/parseMessage/openai.ts`, injetado no boot)
- Se `matchedProductId` retornado → item vinculado ao produto existente no catálogo

### Fallback semana anterior
- Se não houver oferta de um produtor até o momento de geração das ofertas semanais → usar itens da semana anterior para esse produtor

## Ofertas Semanais

- Admin faz parsing da mensagem → revisa resultado → salva como `WeeklyOffering`

### Revisão antes de salvar (2026-09-21)
- Cada item mostra seu **vínculo** com o catálogo: produto existente ou "produto novo — será criado"
- Corrigir o nome **reconfere o catálogo ao sair do campo** (ex.: `"Macaxeira Natural kg"` → `"Macaxeira"` passa a casar). Antes o item seguia marcado como novo e **duplicava** o produto ao salvar. Reconferir a cada tecla travava a digitação
- Identificou o produto e o item está **sem preço** → traz o do catálogo, a mesma regra do `/parse`. Preço que veio da mensagem não é sobrescrito; preço editado à mão vale e atualiza o catálogo ao salvar
- O vínculo é **editável**: dá para forçar um produto do catálogo ou marcar como novo. Escolha manual **congela** — correções de nome depois disso não a desfazem
- Dá para **adicionar produto que não veio na mensagem**, sem re-gerar. Re-gerar substitui a lista inteira (e apaga as correções) — o botão avisa quando já há itens
- Trocar o produtor reconfere a lista contra o catálogo do novo produtor
- Item sem nome bloqueia o salvamento
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

### Bloqueio de semana

- Após o envio do consolidado ao produtor via WhatsApp, a semana é **bloqueada** (`week_locks` no Firestore)
- Membros não-admin não podem criar nem editar pedidos em semana bloqueada (HTTP 403)
- Administradores podem criar e editar pedidos mesmo após o bloqueio
- O bloqueio ocorre tanto pelo envio manual (admin) quanto pelo **scheduler automático de terça-feira às 6h**
- Scheduler: envia para todos os produtores de todas as colmeias que têm pedidos na semana; semanas sem pedidos não são bloqueadas

### Doação de cota

- Membro pode marcar sua cota semanal para doação em **Meus Pedidos** (campo `doacao: boolean` no pedido)
- Ao marcar doação: se não existir pedido para a semana, um é criado com `status: 'rascunho'` e `doacao: true`; extras já pedidos são **preservados**
- Membro marcado para doação é **removido** do planejamento de entrega (tela Entregas)
- Membro com doação aparece no **Consolidado Geral** com a coluna "Doação" marcada automaticamente

### Ordem da lista de entrega

- A lista de entrega (membros `deliveryType: 'entrega'`) pode ser reordenada manualmente pelo admin, arrastando — para sair na ordem que os motoboys usam
- A ordem é salva em `deliveryOrder` (número) por membro; **persiste entre semanas** e é **por colmeia** (o membro pertence a uma)
- Membro sem `deliveryOrder` (recém-cadastrado) aparece **no fim, em ordem alfabética**, até ser posicionado
- Reordenar numa semana em que um quinzenal não aparece **não altera** a posição relativa dele (o merge preserva os ocultos)
- O **texto de WhatsApp** dos motoboys segue essa mesma ordem
- Só vale para a lista de entrega; a lista de retirada na colmeia não é ordenável
- A lista de membros na **Administração** é sempre alfabética (não usa `deliveryOrder`)

### Exceções da semana na lista de entrega

- **Tirar**: o admin suspende a entrega de um membro na semana (`order.suspensa`) — a linha fica
  riscada e ele sai do relatório dos motoboys
- **Pôr**: o admin adiciona à mão quem os filtros semanais deixaram de fora (`order.incluida`).
  A inclusão vence os filtros **e** o `deliveryType`: o caso principal é quem normalmente
  retira na colmeia e nesta semana precisa receber em casa
- A busca lista os candidatos com o **motivo** de estarem fora ("retira na colmeia",
  "quinzenal — outra semana", "doou a cota", "acolhida não confirmada"), para o admin ver que
  às vezes o certo é resolver a causa, não incluir
- A linha incluída ganha o selo **"Adicionada"**, e o mesmo botão que suspende os outros
  **remove a inclusão** dela
- Os dois campos ficam no **pedido da semana**, nunca no usuário: `deliveryType` é do membro, e
  mexer nele mudaria todas as semanas e a cobrança do mês
- **Nenhum dos dois mexe no dinheiro.** O frete continua sendo
  `frete × countDeliveryWeeks(...)`, puro calendário (é assim para `suspensa` desde sempre).
  Quando a semana foge do calendário, o ajuste é a **correção de valor da fatura**, que
  registra autor, motivo e histórico

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
- As semanas são contadas de forma **contínua** a partir de uma âncora fixa (segunda-feira da semana ISO 1 de 2026): `impar` recebe nas semanas de índice par, `par` nas de índice ímpar
- Os nomes `par`/`impar` vêm da regra antiga, que derivava o ciclo do número da semana ISO. Não usar semana ISO para isso: a numeração reseta todo ano e, em ano de 53 semanas (2026, 2032...), a paridade repetiria na virada — um ciclo receberia duas semanas seguidas e o outro ficaria três sem receber
- A âncora não é arbitrária: é a única (mod 2) que preserva a escala que já vigorava, então a migração não mudou a semana de nenhum membro
- O que importa para o membro é **alternar de 2 em 2 semanas**, nunca o rótulo A/B
- Implementação: `isUserDeliveryWeek(user, weekStart)` em `src/lib/weekUtils.ts`; espelho no backend em `server/services/weekMath.ts` (duplicação sai no #18), mantidos em sincronia por `server/services/weekMath.test.ts`
- Na página de pedidos: itens fixos são ocultados quando não é a semana de entrega do usuário
- Na visão de entregas: quinzenais são excluídos da lista quando não é sua semana de entrega
- **Import por CSV define o ciclo quinzenal** a partir da 1ª entrega informada (`paridadeDaSemanaDe`): antes a coluna era descartada e todo quinzenal importado caía no mesmo ciclo (o fallback do `isUserDeliveryWeek`), com metade recebendo na semana errada. Sem data no formulário, o membro fica sem paridade e o admin define no cadastro
- A conferência do import mostra a coluna **Semana (A/B)** antes de criar, para o erro aparecer ali e não na entrega

## Pagamentos

- Uma fatura (`PaymentDoc`) por usuário **por produtor** por mês — chave única: `(userId, tenantId, month, producerName)`
- Mês representado como string `"YYYY-MM"`
- Usuário envia comprovante por fatura → URL em `proofUrl`; admin verifica → `verified: true`
- **Comprovante por semana** (acolhida): `proofs[]` guarda `{ weekId, url, dateUploaded }`. `proofUrl` continua com o último enviado (telas antigas leem dele). Reenviar a mesma semana **substitui**; o dono acrescenta via `POST /payments/:id/comprovante`, nunca reescreve a lista
- Arquivo no Storage: `comprovantes/{tenantId}/{userId}/{mês}/{timestamp}-{nome}` — o carimbo evita que dois envios de mesmo nome no mês se sobrescrevam

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
- Valor mensal = `weeklyRate × quotaQty × countDeliveryWeeks(month, user.frequency, user.quinzenalParity)`
  - `quotaQty` (padrão 1) multiplica a cota: 2 inteiras = `quotaInteira × 2 × semanas`; 3 meias = `quotaMeia × 3 × semanas`
  - Usuário `semanal`: conta todas as quartas-feiras do mês
  - Usuário `quinzenal`: conta apenas as semanas do ciclo do membro
- Vencimento: dia `dueDay` do **mês anterior** (pagamento pré-consumo)
- `dueDay` configurável pelo admin (padrão: 10); salvo em `colmeia.dueDay`
- **Elegibilidade para geração de cota:** `quota` definido + `!isentoCotas` + `!disabled` + `!deleted`
  - Usuário sem campo `quota` → **não** tem cota gerada (campo obrigatório, definido pelo admin no cadastro)
  - Usuário com `isentoCotas: true` → não tem cota gerada; não aparece na lista de verificação
- **Geração automática:** cron job executa às 08h do dia 1 de cada mês (`server/jobs/quotaJob.ts`), gerando cotas para todos os elegíveis de todas as colmeias
- `POST /payments/quota/all` permanece disponível para reprocessamento manual via API

### Frete da Entrega
- Fatura mensal (`producerName === 'Entrega'`) para membros que recebem por entrega (`deliveryType === 'entrega'`)
- Valor **por entrega**, não fixo mensal: `frete × countDeliveryWeeks(month, frequency, quinzenalParity)` — mesma contagem da cota, respeita quinzenal
- **Preço por bairro** (`colmeia.fretePorBairro`: `{ bairro, price }[]`, editável em Configurações → Entregas). Precedência em `freteDoMembro` (`packages/core/src/domain/frete.ts`):
  1. `user.freteDelivery` — override individual; `0` explícito é entrega grátis
  2. preço do **bairro** do membro, casado por nome normalizado (sem acento/caixa/espaço — "Manaíra", "manaira" e "MANAÍRA " são o mesmo bairro)
  3. `colmeia.freteDelivery` — padrão, **só se > 0**. A CSA tem 0 gravado desde que o campo nasceu; tratá-lo como preço válido faria todo mundo virar "entrega grátis" em vez de pendência
  4. **indefinido** → pendência
- **Pendência**: membro de entrega sem preço resolvível **não gera fatura** e entra em `semFrete[]`. Nada de fatura de R$ 0, que esconderia cadastro incompleto. O `quotaJob` avisa o **responsável pelas entregas** (`colmeia.responsavelEntregasId`) por WhatsApp — só pelo job, que é o caminho desatendido; no botão "Gerar faturas" o admin já vê a lista na tela
- **O passado não é afetado:** `colmeia.freteVigenteDesde` (`"YYYY-MM"`) é o primeiro mês em que a fatura de frete pode nascer. Existe porque `POST /payments/frete` dispara para o mês que o membro estiver **navegando** em Meus Pagamentos — sem a trava, passear para setembro criaria a fatura de setembro. A guarda fica no `paymentService`, não na rota: `ensureFrete`, o cron e o `acolhida.ts` são três caminhos para a mesma geração. Ausente = sem trava
- **Elegibilidade:** `deliveryType === 'entrega'` + `!disabled` + `!deleted` + preço resolvível (bairro na tabela com `0` é grátis de propósito, não pendência)
- Membro anexa comprovante e admin verifica — mesmo fluxo das outras faturas (reusa Firebase Storage via `useUploadProof`)
- Vencimento: dia `dueDay` do **mês seguinte** (pós-consumo, como extras)
- **Geração automática:** mesmo cron da cota (dia 1, 08h); `upsertPaymentsForOrder` nunca toca em `'Entrega'`
- `POST /payments/frete/all` disponível para reprocessamento manual via API; `POST /payments/frete` garante a fatura do próprio membro (auto-ensure ao abrir Meus Pagamentos)
- **Na tela o membro lê "Delivery"** (`vocabulary.deliveryFeeLabel`), como se fosse mais um produtor; o dado segue sendo a sentinela `'Entrega'`
- O card mostra a **composição**: `R$ {frete} por entrega · {n} entregas`. O `n` é derivado da própria fatura (`amount / frete`), não recalculado na tela — a contagem de semanas tem quinzenal e acolhida dentro, e uma segunda conta no front divergiria do valor cobrado
- Fatura **corrigida** troca a composição por "Valor ajustado pela organização": a conta deixou de fechar de propósito

### Configurações → Entregas

- **Tabela bairro × preço** (`colmeia.fretePorBairro`): adicionar/remover linha, igual às cotas.
  O botão **"Carregar tabela padrão"** repõe a tabela do app (`config.tenantDefaults.fretePorBairro`,
  35 bairros da CSA) — ela vive versionada no código, não digitada na tela
- **Aviso de bairro sem preço**: a tela lista os bairros que **têm membro de entrega cadastrado**
  e não estão na tabela. São exatamente os que virariam pendência no fim do mês
- **Responsável pelas entregas** (`colmeia.responsavelEntregasId`): escolhido entre os admins
  ativos; recebe o aviso de pendência no WhatsApp quando o job gera as faturas
- **A vigência é carimbada sozinha**: salvar a tabela pela primeira vez grava
  `freteVigenteDesde` com o mês corrente (relógio do tenant). Depender de alguém lembrar de
  preencher esse campo seria depender de ninguém errar justamente onde o erro cobra retroativo
- ⚠️ **`freteDelivery` nunca foi salvo antes de 2026-10-02**: o campo existia na tela desde o
  PR #56, mas não estava na whitelist do `PUT /tenants/:id` — o servidor descartava em silêncio
  e a tela respondia "Salvo!". É por isso que o frete da CSA estava 0: não foi configuração
  esquecida, foi salvamento que nunca funcionou. Valia para os dois apps

### Conferência do Delivery (tela própria)

- `/verificar-delivery` (**só admin** — fornecedor confere o que é dele, e o frete não é de
  produtor nenhum) lista **apenas** as faturas `producerName === 'Entrega'` do mês
- Por isso elas **saíram** de "Verificar Pagamentos": duas telas listando a mesma fatura seriam
  dois lugares para marcar o mesmo pagamento como verificado
- Resumo do mês: faturado, verificado, a conferir (tem comprovante) e sem comprovante — em
  valor e em nº de membros
- **Bloco de pendência no topo**: quem recebe em casa e está sem frete definido não gera fatura
  e, por isso, não apareceria na tabela. Sem esse bloco sumiria da tela e ninguém cobraria
- Cada linha mostra frete unitário (`resolveFrete`), nº de entregas, valor, status e comprovante
- **Editar** por linha: corrigir o valor (com motivo), trocar o comprovante e desfazer a
  correção; o histórico aparece no mesmo dialog
- O comprovante trocado pelo admin sobe na pasta do **membro**
  (`comprovantes/{tenantId}/{userId do membro}/{mês}/`), não na do admin — é onde as outras
  telas procuram
- **Gerar faturas do mês** (`POST /payments/frete/all`) cobre quem virou `entrega` depois do
  dia 1 e nunca abriu Meus Pagamentos

### Correção de fatura pelo admin

- Admin (nunca fornecedor, nunca o dono) ajusta o valor de **qualquer** fatura — cota, frete ou
  produtor — por `POST /payments/:id/correcao` (`{ amount, motivo? }`)
- A correção **trava a geração automática**: enquanto `corrigido: true`, nem o cron do dia 1,
  nem o auto-ensure de Meus Pagamentos, nem a confirmação de semana da acolhida reescrevem o
  valor; e `upsertPaymentsForOrder` também não recalcula nem zera a fatura de produtor
  corrigida. Sem essa trava o ajuste sumia sozinho — a geração roda muitas vezes por mês, não
  só no dia 1, e o próprio membro a dispara ao abrir a tela de pagamentos
- `amountOriginal` guarda o valor que a **geração** produziu (congelado na 1ª correção); numa
  segunda correção ele não muda, senão "desfazer" devolveria a correção anterior
- `correcoes[]` é o histórico — `{ de, para, por (uid), em, motivo? }` — e **acumula**: nada é
  apagado, nem quando a correção é desfeita
- `DELETE /payments/:id/correcao` desfaz: volta ao `amountOriginal`, destrava a geração e
  **registra a volta** no histórico. Fatura sem correção responde 400
- O histórico é carimbado **no servidor**. `PUT /payments/:id` deixou de aceitar `amount`,
  `corrigido`, `amountOriginal` e `correcoes` — aceitar pelo corpo permitiria forjar o registro
