# pedidos — monorepo

Motor compartilhado (`packages/core`) + apps separados (`apps/csa`, `apps/fermentou`).

- **Decisões, estado e roteiro:** [`ARQUITETURA.md`](ARQUITETURA.md)
- **Regras de trabalho e portão de verificação:** [`CLAUDE.md`](CLAUDE.md)

```bash
npm install
npm run build -w @pedidos/core               # gera o dist do motor (necessário p/ os apps)
npm run test:tz --workspaces --if-present    # todos os workspaces ×3 fusos
```
