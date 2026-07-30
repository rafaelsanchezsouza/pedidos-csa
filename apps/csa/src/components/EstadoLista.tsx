import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface EstadoListaProps {
  loading: boolean
  vazio: boolean
  mensagemVazia: string
  children: ReactNode
}

// Estados de carregando/vazio de lista, iguais em todas as telas.
// `loading` vence `vazio`: durante o carregamento a lista está vazia, mas dizer
// "nenhum resultado" antes de os dados chegarem é mentira.
export function EstadoLista({ loading, vazio, mensagemVazia, children }: EstadoListaProps) {
  if (loading) return <div className="py-8 text-center text-muted-foreground">Carregando...</div>
  if (vazio)
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">{mensagemVazia}</CardContent>
      </Card>
    )
  return <>{children}</>
}
