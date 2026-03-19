# Comportamento

## Estilo de resposta
- Idioma: pt-BR em tudo (commits, comentários, texto ao usuário)
- Seja extremamente conciso; sacrifique gramática pela concisão
- Respostas curtas e diretas; sem preâmbulo

## Commits
- Formato conventional commits (feat/fix/refactor/docs/chore)
- **Sem** co-authorship footer do Claude
- Ao commitar mudança que altera rotas, modelos ou comportamento → atualizar doc relevante no mesmo commit

## Planos
- Ao final de cada plano: lista de perguntas não resolvidas (extremamente concisas)

## Arquitetura
DIP + Ports & Adapters: domínio define interfaces (portas), tecnologias externas são adaptadores plugáveis. Rotas dependem de abstrações, nunca de implementações concretas.
- Serviços nomeados pelo domínio, não pela tecnologia (`parseMessage`, não `openai`)
- Interface define o contrato; `index.ts` exporta a implementação ativa; alternativas ficam em arquivos separados

## Docs de referência
- Contexto técnico: [`definicoes_projeto.md`](../definicoes_projeto.md)
- Regras de negócio: [`BUSINESS_RULES.md`](../BUSINESS_RULES.md)
- Visão de produto: [`requirements.md`](../requirements.md)
