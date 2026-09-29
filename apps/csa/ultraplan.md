# Componentização + padronização visual do frontend

## Contexto

13 rotas em `src/pages` (na real, 11 — duas são órfãs, ver abaixo) repetem os mesmos blocos de UI: cabeçalho de página, estado carregando/vazio, badge de status de pagamento. Além da duplicação de código, o usuário identificou inconsistência visual entre telas (posição de botão, largura, ordem de elementos). Objetivo: extrair os padrões repetidos em componentes E aplicar uma arquitetura de cabeçalho única, ordenada, que cobre as duas famílias de tela do app.

Mapeamento confirmado (rotas, `App.tsx` + `Sidebar.tsx` + `BottomNav.tsx`):

| Tela (nome de domínio) | Arquivo | Tipo |
|---|---|---|
| Catálogo | `CatalogoPage.tsx` | Gestão permanente |
| Administração | `AdminPage.tsx` | Gestão permanente |
| Meu Perfil | `PerfilPage.tsx` | Gestão permanente |
| Meus Pedidos | `PedidosPage.tsx` | Gestão semanal |
| Pagamentos | `PagamentosPage.tsx` | Gestão semanal |
| Verificar Pagamentos | `VerificarPagamentosPage.tsx` | Gestão semanal (mensal) |
| Extras da Semana | `OfertasPage.tsx` | Gestão semanal |
| Entregas | `EntregasPage.tsx` | Gestão semanal |
| Consolidado | `ConsolidadoGeralPage.tsx` | Gestão semanal |
| ~~Consolidado (produtor)~~ | `ConsolidadoPage.tsx` (`/consolidado`) | **Órfã — sem link/nav em lugar nenhum, remover** |
| ~~Histórico~~ | `HistoricoPage.tsx` (`/historico`) | **Órfã — sem link/nav em lugar nenhum, remover** |
| Login / Definir senha | `LoginPage.tsx`, `DefinirSenhaPage.tsx` | Auth, fora do padrão (telas centralizadas, sem header) |

Decisões já fechadas com o usuário:
- AdminPage recebe ajuste visual de cabeçalho **agora** (sem separar em arquivos por aba — isso fica pra outra iteração).
- Padrão de borda das tabelas (Catálogo/Admin sem Card vs VerificarPagamentos com Card) **não é tocado** nesta rodada.
- `/consolidado` e `/historico` são código morto → **remover rotas e arquivos**.
- Navegação mobile (labels/ordem divergentes Sidebar vs BottomNav) **fora de escopo** — fica pra outra tarefa.

---

## Arquitetura do cabeçalho: slots ordenados, não JSX livre

Cada página hoje monta a área de topo à mão, com ordem e gaps diferentes. Trocar por um componente único com props nomeadas elimina a divergência por construção — quem usa não escolhe a ordem, só preenche o slot certo.

`src/components/PageHeader.tsx`:
```tsx
interface PageHeaderProps {
  title: string
  titleExtra?: ReactNode      // ex: Badge de status ao lado do h1 (PedidosPage)
  subtitle?: ReactNode         // texto abaixo do título (ex: "Entrega em 12/06")
  secondaryAction?: ReactNode  // botão auxiliar (ex: "Relatório", "Importar CSV")
  primaryAction?: ReactNode    // botão principal da tela (ex: "Novo Membro")
  dateNav?: ReactNode          // WeekNavigator / MonthNavigator
}

export function PageHeader({ title, titleExtra, subtitle, secondaryAction, primaryAction, dateNav }: PageHeaderProps) {
  const hasRight = secondaryAction || primaryAction || dateNav
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {titleExtra}
        </div>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {hasRight && (
        <div className="flex items-center gap-2">
          {secondaryAction}
          {primaryAction}
          {dateNav}
        </div>
      )}
    </div>
  )
}
```
Ordem à direita é sempre `secondaryAction → primaryAction → dateNav` — exatamente a regra do usuário (navegador de data fixo no canto, botão principal desloca pra esquerda quando há data, secundário à esquerda do principal).

Abaixo do `PageHeader`, quando existir, a ordem vertical é sempre:
```
PageHeader (título + ações + subtítulo)
  ↓
Abas (só AdminPage)
  ↓
Filtragem (só CatalogoPage e aba "usuários" do AdminPage — JSX direto, não vale criar componente pra 2 usos)
  ↓
Conteúdo (EstadoLista + lista/tabela)
```

`src/components/EstadoLista.tsx` (carregando/vazio) — mesmo já levantado antes, sem mudança de design:
```tsx
interface EstadoListaProps { loading: boolean; vazio: boolean; mensagemVazia: string; children: ReactNode }
export function EstadoLista({ loading, vazio, mensagemVazia, children }: EstadoListaProps) {
  if (loading) return <div className="py-8 text-center text-muted-foreground">Carregando...</div>
  if (vazio) return <Card><CardContent className="py-8 text-center text-muted-foreground">{mensagemVazia}</CardContent></Card>
  return <>{children}</>
}
```

`src/lib/statusPagamento.ts` — dedupe de `statusLabel`/`statusVariant`, hoje idênticas em `PagamentosPage.tsx:16-26` e `VerificarPagamentosPage.tsx:15-25`.

---

## Por página

### Gestão semanal (sem abas, sem filtro — só PageHeader + EstadoLista)
- **PedidosPage** (`/pedidos`): hoje o `WeekNavigator` tem um `<span>Entrega em</span>` empilhado em cima (`flex-col items-end`, linha 152-155) — inconsistente com as outras telas, que usam `subtitle`. Trocar por `subtitle={\`Entrega em \${getWeekDelivery(weekId)}\`}` (util já importado, linha 9) + `titleExtra={<Badge.../>}` + `dateNav={<WeekNavigator.../>}`.
- **OfertasPage** (`/ofertas`): `PageHeader` com `subtitle` (já existe), `primaryAction` = botão toggle "Extras abertos/encerrados", `dateNav` = `WeekNavigator`. **Largura**: hoje `max-w-4xl` (linha 203) — única divergente da família (as outras 5 são `max-w-3xl`, conteúdo é Card em todas, não tabela) → trocar pra `max-w-3xl`.
- **EntregasPage** (`/entregas`): `PageHeader` com `subtitle` condicional (já existe), `secondaryAction` = botão "Relatório", `dateNav` = `WeekNavigator`.
- **ConsolidadoGeralPage** (`/consolidado-geral`): igual Entregas — `secondaryAction` = "Relatório", `dateNav` = `WeekNavigator`.
- **PagamentosPage** (`/pagamentos`): `PageHeader` só com `dateNav={<MonthNavigator.../>}`, sem ações. Usa `statusPagamento.ts`.
- **VerificarPagamentosPage** (`/verificar-pagamentos`): igual Pagamentos — só `dateNav={<MonthNavigator.../>}`. Usa `statusPagamento.ts`.

### Gestão permanente
- **CatalogoPage** (`/catalogo`): `PageHeader title="Catálogo de Produtos" primaryAction={<Button onClick={openCreate}>Novo Produto</Button>}` (linha 117-120). Filtro (Select produtor + Input busca, linha 123-136) continua como JSX direto, abaixo do header. `EstadoLista` no lugar do bloco carregando/vazio. Largura `max-w-4xl` mantida (tabela desktop).
- **PerfilPage** (`/perfil`): `PageHeader title="Meu Perfil"` no lugar do `<h1>` solto (linha 58) — sem subtitle/ações. Baixo risco, incluído pra fechar os 100% das telas com header.
- **AdminPage** (`/admin`) — **mudança visual, sem separar arquivo**:
  - `<Tabs defaultValue="usuarios">` (linha 399) passa a ser controlado: `const [tab, setTab] = useState('usuarios')` + `<Tabs value={tab} onValueChange={setTab}>`.
  - `<h1>Administração</h1>` (linha 397) vira `<PageHeader title="Administração" secondaryAction={...} primaryAction={...} />`, com ação por aba:
    - `usuarios`: `secondaryAction` = botão "Importar CSV" (hoje linha 423-425, sai do meio do filtro), `primaryAction` = "Novo Membro" (linha 426-428).
    - `produtores`: `primaryAction` = "Novo Produtor" (hoje linha 546-549, bloco `flex justify-end` inteiro é removido — ação sobe pro header).
    - `configuracoes`: sem ação.
    - `colmeias`: `primaryAction` = "Nova Colmeia" (hoje linha 708-711, mesmo tratamento de produtores).
  - Cada `TabsContent` perde a linha de ação isolada; `usuarios` mantém só `Input busca` + toggle "Mostrar inativos" como linha de filtragem (abaixo das Abas, acima da tabela) — exatamente a ordem Título→Abas→Filtragem→Conteúdo.
  - Empty-state em `<TableRow><TableCell>` continua manual (incompatível com `EstadoLista`, que é baseado em `Card`) — fora de escopo, igual já decidido.

### Remoção de código morto
- Deletar `src/pages/ConsolidadoPage.tsx` e `src/pages/HistoricoPage.tsx`.
- Remover as rotas `/consolidado` e `/historico` e os imports correspondentes em `src/App.tsx`.
- Confirmado via grep: nenhum outro arquivo referencia esses dois componentes.

### Descartado (não compensa — critério: <3 usos reais)
`<FormDialog>` genérico, `<BotaoIcone>`, `<FiltroBar>` genérico (só 2 usos), `<TextAreaDialog>` de relatório com copiar (3 usos: Consolidado Geral, Entregas — `ConsolidadoPage` saiu da lista por ser removida), `<StatusPedido>` (badge Enviado/Rascunho — com a remoção de `HistoricoPage`, sobra só 1 uso em `PedidosPage`, nem vale extrair). Par "tabela desktop / cards mobile" (`hidden md:block`/`md:hidden`) — conteúdo interno varia demais, não vira componente.

---

## Ordem de execução e commits

1. `refactor: extrai statusPagamento.ts` — `src/lib/statusPagamento.ts`, atualiza `PagamentosPage.tsx` e `VerificarPagamentosPage.tsx`
2. `chore: remove rotas e telas órfãs` — deleta `ConsolidadoPage.tsx`, `HistoricoPage.tsx`, atualiza `App.tsx`
3. `refactor: cria PageHeader e EstadoLista, aplica nas páginas de gestão semanal` — `PedidosPage`, `OfertasPage` (+ fix largura), `EntregasPage`, `ConsolidadoGeralPage`, `PagamentosPage`, `VerificarPagamentosPage`
4. `refactor: aplica PageHeader/EstadoLista em Catálogo e Perfil` — `CatalogoPage`, `PerfilPage`
5. `refactor: reestrutura cabeçalho do AdminPage por aba` — `Tabs` controlado + `PageHeader` com ação dinâmica por aba, remove linhas de ação duplicadas

Cada commit roda `npm run build` antes do próximo.

## Verificação

- `npm run build` sem erros de TS após cada commit
- Testar no browser: as 4 abas do AdminPage (botão certo aparece por aba, filtro de usuários ainda funciona), `PedidosPage` (subtitle + badge + nav), `OfertasPage` (largura 3xl, toggle funciona), `CatalogoPage` (filtro + criar produto), `/consolidado` e `/historico` retornam 404 (rota removida) sem quebrar outras rotas
- Confirmar login → navegação por Sidebar/BottomNav continua íntegra (não foi alterada)

## Perguntas não resolvidas
Nenhuma — todas as decisões foram fechadas com o usuário nesta rodada.