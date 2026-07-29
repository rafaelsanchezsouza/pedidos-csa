# Backlog

Ordem de execução. Feedback de usuário (`feedback.md`) tem prioridade sobre issues abertas.

Toda issue aberta tem label de prioridade (`P0`–`P3`) no GitHub — esta é a fonte de verdade
para o *porquê* da ordem; as labels são para filtrar.

## ✅ P0 — concluído, em produção (PR #49)

| # | Item | Issue | Status |
|---|------|-------|--------|
| 1 | Ciclo quinzenal escondido no bottom da tela, impossível de selecionar (mobile e desktop) | #44 | ✅ corrigido |
| 2 | Dias de entrega da cesta: semana marcada errada gerando cobrança a mais | #43 | ✅ corrigido |

Eram bugs independentes, não a mesma raiz:

- **#43** — em produção de 19/03 a 16/07/2026 (~4 meses, nunca houve versão correta no ar).
  `getISOWeekNumber` parseava a data como UTC e lia com getters locais; em fuso
  negativo (BR) a semana ISO saía off-by-one e invertia a paridade de todo quinzenal. O
  servidor acertava a semana, então a UI dizia "não pega" enquanto a cobrança contava → valor
  a mais. Corrigido em `008a901`, com testes travando a independência de fuso.
- **#44** — `DialogContent` sem `max-h`/`overflow`; dialog alto transbordava a viewport e os
  campos do fim ficavam inalcançáveis. Corrigido em `81fb6f2`, vale para todos os dialogs.

- **#48** — achado de passagem: a paridade quebrava na virada 2026→2027 (ano ISO de 53
  semanas ⇒ duas semanas ímpares seguidas). Corrigido em `513a318` trocando a paridade ISO
  por um contador contínuo, que não tem virada de ano. Backend tinha a regra duplicada e
  mudou junto; sincronia travada por teste até o #18 unificar.

## ✅ Também concluído e em produção

- **#40 — componentização/padronização do frontend** (PR #52, deploy 2026-07-17). PageHeader/EstadoLista, statusPagamento, remoção de telas órfãs, 1ª infra de teste de UI.
- **Header mobile empilhado + navegador sticky** (PR #53, deploy 2026-07-17, verificado no aparelho pelo usuário). Follow-up do #40.
- **#50 — conferência das cobranças do #43** — verificado e resolvido pelo usuário.

## ✅ Concluído e VALIDADO — na `main` (2026-07-29)

- **#45 — quantidade de cotas por membro** (`quotaQty`, PR #57). Cobrança = `valor semanal ×
  quotaQty × nº de entregas do mês`. Decisão: **tipo + quantidade** (não mistura inteira+meia;
  usa 2 cadastros). 83 testes verdes. **Validado pelo usuário 2026-07-29.** Na `main`;
  **falta só o deploy manual** (`deploy.sh`) pra chegar à produção.
- **#47 — fatura de frete da entrega** (PR #56). Deployado em prod desde 2026-07-19 e
  **validado pelo usuário 2026-07-29** — pode fechar a issue #47.
- **Import de catálogo via CSV** (entrou junto no PR #57).

## P1 — feedback de usuário

Todo o feedback priorizado está **concluído e validado** (#45, #46, #47).

Feito e validado: **#46** (drag-and-drop da lista de entrega + admin alfabético) — em
produção, validado no mobile (PRs #54/#55). Itens 4 e 5 do feedback original.

## P2 — issues de produto

| # | Item | Issue |
|---|------|-------|
| 7 | Aba separada para membros quinzenais | #31 |
| 8 | Botão "Membro saiu" na AdminPage | #33 |
| 9 | Exportar lista de entregas (CSV) | #30 |
| 10 | Conteúdo lúdico semanal (foto/frase) | #29 |

7 e 8 são administração recorrente. **9 (CSV) — reavaliar antes de fazer**: o #46 já entrega
a lista de entrega ordenada e o texto de WhatsApp na ordem dos motoboys; confirmar com o
usuário se o CSV ainda faz falta ou se pode fechar como não-necessário. 10 é o único puramente
cosmético.

## P3 — dívida técnica

| # | Item | Issue |
|---|------|-------|
| 11 | Sanitizar mensagens de erro nos handlers | #10 |
| 12 | ~~Extrair PaymentService + cron job para cotas~~ — **aparentemente concluído** (`server/services/paymentService.ts` extraído + `server/jobs/quotaJob.ts` no ar); confirmar e fechar a issue | #18 |
| 13 | Observabilidade — Sentry, Pino, métricas | #22 |
| 14 | `npm run lint` quebrado (eslint fora das devDeps; nunca rodou) | sem issue |
| 15 | CatalogoPage esconde o header no load (empty-state em `<TableRow>`, migrar p/ Card) | sem issue |
| 16 | Ambiente de dev hospedado (`dev.csaparahyba.com.br`) — **prep pronta** na branch `chore/ambiente-dev` (não mergeada); falta DNS + certbot + 1º deploy. Ver `RUNBOOK-DEV.md` | sem issue |

11 é segurança e barato. **12 (#18) já foi feito** na prática — o PaymentService foi extraído
antes do #45, por isso o #45 não teve o atrito previsto. 13 ajuda a achar bugs como o #43.
14 é rápido e destrava um portão de qualidade. 15 é pequeno. 16 destrava validar features de
cobrança (como #45/#47) sem risco a dado real. (#40 concluído — ver acima.)

## Perguntas em aberto

- Comprovante (#6): onde armazenar? (Firestore não guarda binário — precisa de storage.) Alguém valida ou só anexa?
- Isolamento do WhatsApp no ambiente de dev (#16): subir uma instância Evolution separada, ou aceitar o cron desligado (envios manuais na UI do dev ainda saem reais)?

> Resolvidas: **quantidade (#45)** = tipo + `quotaQty` (padrão 1), afeta cobrança automaticamente
> (`valor × qty × semanas`). **#12/#18** = PaymentService já extraído.
