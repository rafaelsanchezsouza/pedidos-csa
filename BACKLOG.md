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

## P1 — feedback de usuário (PRÓXIMA FASE)

| # | Item | Issue | Nota |
|---|------|-------|------|
| 3 | Quantidade por pedido: cota cheia / meia / N cotas (padrão 1) | #45 | Hoje André precisa de 2 cadastros; Luciano recebe 2–3 meias. Muda modelo de dados. Ver #18 antes. |
| 4 | Ordem manual (drag and drop) da lista de entrega, persistida entre semanas | #46 | Lista dos motoboys |
| 5 | Ordem alfabética na administração | #46 | Trivial, sai junto do 4 |
| 6 | Upload de comprovante de pagamento do delivery pelo membro | #47 | Precisa storage + tela |

## P2 — issues de produto

| # | Item | Issue |
|---|------|-------|
| 7 | Aba separada para membros quinzenais | #31 |
| 8 | Botão "Membro saiu" na AdminPage | #33 |
| 9 | Exportar lista de entregas (CSV) | #30 |
| 10 | Conteúdo lúdico semanal (foto/frase) | #29 |

7 e 8 são administração recorrente. 9 pode virar dispensável se o 4 entregar a lista pronta —
reavaliar depois. 10 é o único puramente cosmético.

## P3 — dívida técnica

| # | Item | Issue |
|---|------|-------|
| 11 | Sanitizar mensagens de erro nos handlers | #10 |
| 12 | Extrair PaymentService + cron job para cotas | #18 |
| 13 | Observabilidade — Sentry, Pino, métricas | #22 |
| 14 | `npm run lint` quebrado (eslint fora das devDeps; nunca rodou) | sem issue |
| 15 | CatalogoPage esconde o header no load (empty-state em `<TableRow>`, migrar p/ Card) | sem issue |

11 é segurança e barato. 12 provavelmente encosta no P1 #3 — considerar puxar para antes do
#3 se o modelo de cotas for mexido de qualquer forma. 13 ajuda a achar bugs como o #43.
14 é rápido e destrava um portão de qualidade. 15 é pequeno. (#40 concluído — ver acima.)

## Perguntas em aberto

- Quantidade (#3): campo livre ou enum (cheia/meia/2×meia)? Afeta cobrança automaticamente?
- Ordem persistida (#4): por colmeia ou global? Membro novo entra onde?
- Comprovante (#6): onde armazenar? (Firestore não guarda binário — precisa de storage.) Alguém valida ou só anexa?
- #12 (#18) antes ou depois do #3? Se o modelo de cotas muda no #3, refatorar o PaymentService antes evita mexer duas vezes.
