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
// secondaryAction → primaryAction → dateNav (navegador de data fixo no canto).
// A ordem é travada por PageHeader.test.tsx — mudar aqui quebra o teste.
export function PageHeader({
  title,
  titleExtra,
  subtitle,
  secondaryAction,
  primaryAction,
  dateNav,
}: PageHeaderProps) {
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
