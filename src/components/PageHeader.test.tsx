// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './PageHeader'

// Ordem de leitura do DOM: é o que o usuário vê e o que o leitor de tela anuncia.
function ordemDosBotoes(): string[] {
  return screen.getAllByRole('button').map((b) => b.textContent ?? '')
}

describe('PageHeader', () => {
  it('mostra o título', () => {
    render(<PageHeader title="Entregas" />)
    expect(screen.getByRole('heading', { name: 'Entregas' })).toBeInTheDocument()
  })

  it('não renderiza a área direita quando não há nenhuma ação', () => {
    const { container } = render(<PageHeader title="Meu Perfil" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // sem ações e sem dateNav, não há barra sticky
    expect(container.querySelector('.sticky')).toBeNull()
  })

  it('envolve o dateNav numa barra sticky (fica visível ao rolar no mobile)', () => {
    const { container } = render(
      <PageHeader title="Entregas" dateNav={<button>Navegador</button>} />,
    )
    const sticky = container.querySelector('.sticky')
    expect(sticky).not.toBeNull()
    expect(sticky).toContainElement(screen.getByRole('button', { name: 'Navegador' }))
  })

  // A razão de existir do componente: a ordem não é escolha de quem usa.
  it('ordena a direita em secondaryAction → primaryAction → dateNav', () => {
    render(
      <PageHeader
        title="Administração"
        secondaryAction={<button>Importar CSV</button>}
        primaryAction={<button>Novo Membro</button>}
        dateNav={<button>Navegador</button>}
      />,
    )
    expect(ordemDosBotoes()).toEqual(['Importar CSV', 'Novo Membro', 'Navegador'])
  })

  it('mantém a ordem mesmo quando os slots são passados fora de ordem', () => {
    render(
      <PageHeader
        title="Administração"
        dateNav={<button>Navegador</button>}
        primaryAction={<button>Novo Membro</button>}
        secondaryAction={<button>Importar CSV</button>}
      />,
    )
    expect(ordemDosBotoes()).toEqual(['Importar CSV', 'Novo Membro', 'Navegador'])
  })

  it('preserva a ordem relativa quando só alguns slots existem', () => {
    render(
      <PageHeader
        title="Entregas"
        secondaryAction={<button>Relatório</button>}
        dateNav={<button>Navegador</button>}
      />,
    )
    expect(ordemDosBotoes()).toEqual(['Relatório', 'Navegador'])
  })

  it('põe titleExtra ao lado do título, não na área de ações', () => {
    render(<PageHeader title="Meus Pedidos" titleExtra={<span>Enviado</span>} />)
    const h1 = screen.getByRole('heading', { name: 'Meus Pedidos' })
    const badge = screen.getByText('Enviado')
    expect(h1.parentElement).toBe(badge.parentElement)
  })

  it('põe subtitle abaixo do título', () => {
    render(<PageHeader title="Meus Pedidos" subtitle="Entrega em 15/07" />)
    const sub = screen.getByText('Entrega em 15/07')
    const h1 = screen.getByRole('heading', { name: 'Meus Pedidos' })
    expect(sub.tagName).toBe('P')
    // subtitle é irmão do bloco do título, não filho dele
    expect(sub.parentElement).toBe(h1.parentElement?.parentElement)
  })

  it('não renderiza subtitle quando ausente', () => {
    const { container } = render(<PageHeader title="Catálogo" />)
    expect(container.querySelector('p')).toBeNull()
  })
})
