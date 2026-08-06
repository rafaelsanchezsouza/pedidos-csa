# pedidos — monorepo (motor compartilhado, apps separados)

Motor único `packages/core` consumido por apps **deployáveis sozinhos** (`apps/csa`,
`apps/fermentou`). **Leia `ARQUITETURA.md` primeiro** — decisões, estado das tasks e o que
falta. Os repos originais (`~/repos/pedidos-csa`, `~/repos/pedidos-app`) seguem intactos como
fonte da verdade em produção até este monorepo substituí-los.

## Comportamento
- pt-BR em tudo (commits, comentários, texto ao usuário); extremamente conciso
- Conventional commits (feat/fix/refactor/docs/chore), **sem** co-authorship footer do Claude
- Decisão de arquitetura/regra de negócio → atualizar `ARQUITETURA.md` **no mesmo commit**
- **NUNCA** commitar dados pessoais de clientes

## Portão de verificação (sem CI — o verde local é o único portão)
```bash
npm run build -w @pedidos/core               # SEMPRE antes dos apps (consomem o dist/)
npm run test:tz --workspaces --if-present    # ×3 fusos (BR/UTC/UTC+14) — NÃO PULAR
npm run build -w pedidos-app  && npm run build:backend -w pedidos-app
npm run build -w pedidos-csa  && npm run build:backend -w pedidos-csa
```
Mudou estrutura de emissão? `rm -rf apps/*/dist-server` antes de rebuildar (tsc não limpa
`outDir`). O backend do fermentou emite em `dist-server/server/index.js` (rootDir `..` para
incluir `src/config.ts`); `start` e `deploy.sh` já apontam para lá.

## Regras do engine (estabelecidas na task 5 — manter)
- Rotas/serviços do core são **factories `(deps, config)`**; portas em
  `packages/core/src/server/repo.ts` (`Repo`, `AuthGateway`, `WhatsAppGateway`)
- **Adapters ficam no app**: `server/adapters.ts`, `repositories/firestore.ts`,
  `middleware/auth.ts`, `services/whatsapp/` e jobs (cron é infra do app; o core expõe a lógica)
- **Engine não lê `process.env`** — integrações/segredos entram no boot do app
- `@pedidos/core/server` é export **separado do barrel raiz** (o front importa
  `@pedidos/core` e não pode arrastar express)
- Telefone: normalizar **uma vez, no adapter que envia** (`normalizePhone` do core); serviços
  do engine repassam o contato cru
- `deliveryType`: o motor só pergunta `isEntrega(u)`; o token de não-entrega
  (`retirada`/`colmeia` legado) é vocabulário de UI, nunca decide regra
- Testes do engine: servidor http real em porta efêmera (`server/testutil.ts`) + `memoryRepo`
