# Comportamento

## Estilo de resposta
- Idioma: pt-BR em tudo (commits, comentários, texto ao usuário)
- Seja extremamente conciso; sacrifique gramática pela concisão
- Respostas curtas e diretas; sem preâmbulo

## Branches e ambientes
- **`dev`** → ambiente de desenvolvimento; todo trabalho novo vai aqui
- **`main`** → produção; só recebe PR vindo de `dev`
- Nunca commitar diretamente em `main`; PR `dev → main` = migração para produção
- Backend na porta **3004** (VM Oracle — ver `~/repos/DEPLOY-PLAYBOOK.md`)

## Commits
- Formato conventional commits (feat/fix/refactor/docs/chore)
- **Sem** co-authorship footer do Claude
- Ao commitar mudança que altera rotas, modelos ou comportamento → atualizar doc relevante no mesmo commit
- Quando regra de negócio for discutida e decidida → atualizar `BUSINESS_RULES.md` no mesmo commit
- **NUNCA** commitar dados pessoais de clientes (nome, email, celular, endereço) — scripts de seed com dados reais ficam fora do git

## Planos
- Ao final de cada plano: lista de perguntas não resolvidas (extremamente concisas)

## Testes
- Vitest; testes ao lado do código — `*.test.ts` (lógica, ambiente node) e `*.test.tsx` (componente, `// @vitest-environment jsdom` + Testing Library)
- Sem CI: rodar `npm test` + `npm run build` antes de PR para `main`
- Cálculo de data/fuso: `npm run test:tz` (já quebrou 3x por fuso — ver "Datas e fusos" em `definicoes_projeto.md`)

## Deploy
- **Merge em `main` NÃO faz deploy** — não há CI/CD. Produção só atualiza rodando `./deploy.sh` (build local + scp para a VM Oracle + pm2 restart)
- Produção: ainda não publicada

## Fork do pedidos-csa
Este repo é fork de `~/repos/pedidos-csa` (cliente diferente, CSA segue viva). O tenant
foi renomeado de `colmeia` para `tenant` no código, junto com o resto do vocabulário
CSA — a intenção é **remesclar o backend** com o `pedidos-csa`, e a reconciliação sai no
merge, não via `cherry-pick` (que deixa de funcionar). Na UI o tenant aparece pelo **nome**
(`tenant.name`); a marca do produto vem de `APP_NAME` (`src/lib/brand.ts`).

## Arquitetura
DIP + Ports & Adapters: domínio define interfaces (portas), tecnologias externas são adaptadores plugáveis. Rotas dependem de abstrações, nunca de implementações concretas.
- Serviços nomeados pelo domínio, não pela tecnologia (`enviarMensagem`, não `evolutionApi`)
- Interface define o contrato; `index.ts` exporta a implementação ativa; alternativas ficam em arquivos separados
- WhatsApp: seguir o protocolo `zap-in/1` (`~/repos/ZAP-PROTOCOL.md`) — instância **dedicada**, o bot fala com terceiros

## Docs de referência
- Contexto técnico: [`definicoes_projeto.md`](../definicoes_projeto.md)
- Regras de negócio: [`BUSINESS_RULES.md`](../BUSINESS_RULES.md)
- Visão de produto: [`requirements.md`](../requirements.md)
