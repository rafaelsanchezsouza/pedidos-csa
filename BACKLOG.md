# Backlog

Ordem de execução. Feedback de usuário (`feedback.md`) tem prioridade sobre issues abertas.

Toda issue aberta tem label de prioridade (`P0`–`P3`) no GitHub — esta é a fonte de verdade
para o *porquê* da ordem; as labels são para filtrar.

## P0 — bugs que quebram uso hoje

| # | Item | Issue | Status |
|---|------|-------|--------|
| 1 | Ciclo quinzenal escondido no bottom da tela, impossível de selecionar (mobile e desktop) | #44 | ✅ corrigido |
| 2 | Dias de entrega da cesta: semana marcada errada gerando cobrança a mais | #43 | ✅ corrigido |

Eram bugs independentes, não a mesma raiz:

- **#43** — `getISOWeekNumber` parseava a data como UTC e lia com getters locais; em fuso
  negativo (BR) a semana ISO saía off-by-one e invertia a paridade de todo quinzenal. O
  servidor acertava a semana, então a UI dizia "não pega" enquanto a cobrança contava → valor
  a mais. Corrigido em `008a901`, com testes travando a independência de fuso.
- **#44** — `DialogContent` sem `max-h`/`overflow`; dialog alto transbordava a viewport e os
  campos do fim ficavam inalcançáveis. Corrigido em `81fb6f2`, vale para todos os dialogs.

- **#48** — achado de passagem: a paridade quebrava na virada 2026→2027 (ano ISO de 53
  semanas ⇒ duas semanas ímpares seguidas). Corrigido em `513a318` trocando a paridade ISO
  por um contador contínuo, que não tem virada de ano. Backend tinha a regra duplicada e
  mudou junto; sincronia travada por teste até o #18 unificar.

## P1 — feedback de usuário

| # | Item | Issue | Nota |
|---|------|-------|------|
| 3 | Quantidade por pedido: cota cheia / meia / N cotas (padrão 1) | #45 | Hoje André precisa de 2 cadastros; Luciano recebe 2–3 meias. Muda modelo de dados. |
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
| 14 | Componentização e padronização visual do frontend | #40 |

11 é segurança e barato. 12 provavelmente encosta no P0 #2 e no P1 #3 — considerar puxar
para antes do #3 se o modelo de cotas for mexido de qualquer forma. 13 ajuda a achar bugs
como o #43. 14 é grande; fazer incremental junto das telas do P1.

## Perguntas em aberto

- #43 inverteu a paridade de todos os quinzenais em produção enquanto esteve no ar. As
  cobranças já emitidas precisam de conferência/estorno, ou resolve daqui pra frente?
- Quantidade (#3): campo livre ou enum (cheia/meia/2×meia)? Afeta cobrança automaticamente?
- Ordem persistida (#4): por colmeia ou global? Membro novo entra onde?
- Comprovante (#6): onde armazenar? Alguém valida ou só anexa?
- #12 antes ou depois do #3?
