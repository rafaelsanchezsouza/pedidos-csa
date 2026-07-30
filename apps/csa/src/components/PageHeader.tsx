import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  titleExtra?: ReactNode // ex: Badge de status ao lado do h1 (PedidosPage)
  subtitle?: ReactNode // texto abaixo do título (ex: "Entrega em 12/06")
  secondaryAction?: ReactNode // botão auxiliar (ex: "Relatório", "Importar CSV")
  primaryAction?: ReactNode // botão principal da tela (ex: "Novo Membro")
  dateNav?: ReactNode // WeekNavigator / MonthNavigator
}

// Cabeçalho único de todas as telas com header. Os slots são nomeados de propósito:
// quem usa preenche o slot certo e não escolhe a ordem, então as telas não divergem
// entre si por construção. A ordem à direita é sempre
// secondaryAction → primaryAction → dateNav. A ordem no DOM é travada por
// PageHeader.test.tsx — mudar aqui quebra o teste.
//
// Layout responsivo (o desktop nunca teve o problema; largura sobra):
// - Desktop (sm+): linha horizontal — título à esquerda, [ações][navegador] à direita.
// - Mobile: empilha em título → ações → navegador. O navegador ganha linha própria,
//   colada no conteúdo, e sua posição deixa de depender do tamanho do título/subtítulo
//   (era a causa do "posiciona diferente dependendo do texto").
//
// O `contents` no mobile é o truque que faz o navegador grudar (sticky) sobre a lista
// inteira: ele dissolve as caixas do PageHeader, então o pai do navegador passa a ser a
// raiz da página (alta) em vez do header (curto). Sticky só gruda enquanto o pai está
// visível — com o header como pai, ele soltaria logo no início da rolagem.
export function PageHeader({
  title,
  titleExtra,
  subtitle,
  secondaryAction,
  primaryAction,
  dateNav,
}: PageHeaderProps) {
  const hasActions = secondaryAction || primaryAction
  const hasRight = hasActions || dateNav
  return (
    <div className="contents sm:flex sm:items-center sm:justify-between sm:gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{title}</h1>
          {titleExtra}
        </div>
        {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {hasRight && (
        <div className="contents sm:flex sm:items-center sm:gap-2">
          {hasActions && (
            <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:contents">
              {secondaryAction}
              {primaryAction}
            </div>
          )}
          {dateNav && (
            // Mobile: barra sticky de largura total, colada no topo da rolagem.
            // -mx-3 compensa o padding do <main> (p-3) para a barra sangrar de ponta a ponta.
            <div className="sticky top-0 z-20 -mx-3 mt-3 border-b bg-background px-3 py-2 sm:static sm:z-auto sm:mx-0 sm:mt-0 sm:border-0 sm:p-0">
              {dateNav}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
