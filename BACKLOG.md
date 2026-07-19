# Backlog

Ordem de execução. Fases em `requirements.md`.

## F1 — Operação web

| # | Item | Nota |
|---|------|------|
| 1 | Firebase novo (projeto + Auth + Firestore + Storage) | bloqueia tudo; ação manual no console |
| 2 | Primeiro admin + `POST /api/setup` | ver README |
| 3 | Cadastrar catálogo real da padaria | define `type` fixo/extra de cada item |
| 4 | Revisar textos de UI que ainda falam de CSA | "colmeia", "cesta", "coagricultor" |
| 5 | Rodar `deploy.sh` para a VM (porta 3004, nginx) | reservar porta/domínio no `DEPLOY-PLAYBOOK.md` |

## F2 — WhatsApp

| # | Item | Nota |
|---|------|------|
| 6 | Instância dedicada na evolution-api | número próprio; ver `ZAP-PROTOCOL.md` §4 |
| 7 | Adaptador inbound + gateway outbound | copiar de `note-app/server/services/whatsapp*` |
| 8 | Auto-cadastro do cliente por telefone | pendente de aprovação do admin antes de ativar |
| 9 | Menu conversacional (cardápio / pedir extra / fatura) | estado por chat no Firestore |

## F3 — Pix

| # | Item | Nota |
|---|------|------|
| 10 | Cobrança por pedido, pré-entrega | chave estática + comprovante |

## Dívida herdada do fork

| # | Item |
|---|------|
| 11 | `weekUtils.ts` (client) e `weekMath.ts` (server) duplicam a mesma regra — unificar |
| 12 | Decidir o destino de: período de acolhida, quinzenal, doação de cota, `role` livre |
| 13 | Avaliar renomear `colmeia` → `padaria` quando os forks divergirem de vez |
