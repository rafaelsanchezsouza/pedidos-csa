# Fluxos — a ação do dia como tela principal

> **Status: em desenho, não implementado** (aberto em 2026-11-08). Documento vivo: atualize
> sempre que algo daqui for decidido, implementado ou descartado — e anote a data. Decisões
> tomadas na implementação vão também para `ARQUITETURA.md`, no mesmo commit.

## 1. Ideia

O app responde **"o que eu faço agora?"** antes de "onde fica X?". Em vez de uma lista de
tarefas, a ação principal do momento **vira a tela inicial**: no dia de pedir extras, pedir
extras está na frente; no vencimento da cota, pagar a cota; depois do pagamento, "tudo em dia,
próxima entrega quarta".

Decidido com o usuário (2026-11-08):
- Vale para **membros e organização** (tesouraria, ofertas, entregas).
- A **tela inicial vira o fluxo**; o menu continua inteiro para quem quiser navegar.
- **App primeiro, WhatsApp depois** — o motor é desenhado para servir os dois.

**Já existe um protótipo**: a `/acolhida` (Minha Semana). Quem está em acolhida cai nela ao
entrar, com as ações de prazo na frente (confirmar a semana, anexar comprovante) e o menu
completo (`apps/csa/src/App.tsx`, `apps/csa/BUSINESS_RULES.md` "Período de Acolhida"). Os fluxos
generalizam esse padrão; a acolhida vira um caso particular.

## 2. Princípio: tarefa é derivada, não cadastrada

Nenhuma coleção de tarefas. A ação sai do **calendário + estado** que já existem (pedido
enviado? fatura paga? semana confirmada?). Concluir a ação a faz sumir sozinha — não há tarefa
para marcar como feita nem para dessincronizar do dado real. Mesma linha do engine: ausência é
sinal.

## 3. Calendário da CSA (o que dispara cada fluxo)

Fontes: `apps/csa/BUSINESS_RULES.md`, `packages/core/src/domain/week.ts`, `packages/core/src/config.ts`.

**Semanal**
- Ofertas salvas pelo admin (a partir da mensagem do produtor) → janela de **pedido de extras**.
- Prazo do pedido: `orderSendDay`/`orderSendHour` (CSA: terça 6h, fuso do tenant). O
  `sendOrdersJob` envia o consolidado aos produtores e **trava a semana**.
- Entrega na **quarta** (`getWeekDelivery`). Quinzenal: só nas semanas do ciclo
  (`isUserDeliveryWeek`).
- Acolhida: confirmar a semana até **segunda 23h59**.

**Mensal**
- Dia 1, 08h: `quotaJob` gera cota e frete.
- Cota vence no `dueDay` do **mês anterior** (pré-consumo); extras e frete no `dueDay` do
  **mês seguinte** (pós-consumo).

## 4. Catálogo de fluxos (proposta)

### Membro

| Fluxo | Quando aparece | Some quando | Leva para |
|---|---|---|---|
| Pedir extras | oferta da semana publicada, antes do prazo, semana de entrega do membro | pedido enviado ou prazo passou | `/pedidos` |
| Doar cota / avisar ausência | mesma janela | pedido com `doacao` | `/pedidos` |
| Confirmar semana (acolhida) | em acolhida, até segunda 23h59 | confirmou (sim ou não) | `/acolhida` (já existe) |
| Pagar cota | fatura de cota sem comprovante, perto/após o vencimento | comprovante anexado | `/pagamentos` |
| Pagar extras e delivery | faturas do mês sem comprovante, perto/após vencimento | comprovante anexado | `/pagamentos` |
| Tudo em dia | nenhuma ação pendente | — | mostra a próxima entrega |

### Organização

| Fluxo | Papel | Quando aparece | Some quando |
|---|---|---|---|
| Publicar ofertas | admin | semana sem oferta de um produtor ativo | oferta salva |
| Conferir comprovantes | tesouraria | há faturas "a conferir" | todas verificadas |
| Cobrar pendentes | tesouraria | faturas sem comprovante após o vencimento | pagas ou zeradas |
| Membro de entrega sem frete | entregas | `semFrete` não vazio | preço definido |
| Lista de entrega | entregas | dia de entrega | dia passou |
| Fatura a gerar | tesouraria | membro cadastrado após o dia 1 sem fatura do mês | fatura gerada |

## 5. Motor (proposta, no padrão do engine)

- Função **pura** no core: `proximasAcoes(ator, tenant, agora, estado) → Acao[]`, com
  `Acao = { id, papel, titulo, prazo?, prioridade, rota }`.
- Fuso via `relogioDoTenant`/`semanaDoTenant` (`domain/week.ts`). Reaproveitar as regras que já
  existem em vez de recalcular: `emAcolhida` (`domain/acolhida.ts`), `isUserDeliveryWeek`,
  `freteDoMembro` (`domain/frete.ts`), o vencimento de `buildDueDate`
  (`server/services/payments.ts`, a extrair para o domínio).
- Rota `GET /acoes` (factory `(deps, config)`) monta o `estado` a partir do `Repo` e devolve as
  ações do `Ator`. A ação na tela **não é permissão**: o servidor continua autorizando cada rota.
- Lembrete por WhatsApp (fase 4): um job do app chama a mesma função; telefone normalizado no
  adapter. Cuidado: o zap de dev é o mesmo de produção.

## 6. Tela

`/` abre **"Hoje"**: uma ação principal grande, uma fila curta com as demais e o estado "tudo em
dia". Menu inalterado. A `/acolhida` passa a ser renderizada por esse mesmo mecanismo.

## 7. Fases

1. Motor puro + testes ×3 fusos, só fluxos do membro.
2. Tela "Hoje" do membro.
3. Fluxos da organização.
4. Lembrete por WhatsApp (opt-in, sem repetir).
5. Fermentou (vocabulário próprio).

## 8. Fora de escopo e riscos

- Não é agenda editável nem tarefa manual.
- Lembrete não pode virar spam.
- Prioridade errada esconde o que importa: a fila curta continua visível.

## 9. Perguntas em aberto

- Prioridade quando duas ações vencem juntas?
- Dá para dispensar uma ação ("lembrar depois")?
- Quais papéis existem de fato na CSA (`role`: financeiro, entregas…)?
- Lembrete só para quem tem zap cadastrado?
- Métrica de sucesso (menos atraso de pagamento? mais pedidos de extras?)

## 10. Histórico

- 2026-11-08 — documento aberto; decisões de público, convivência e canal (§1).
