// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Comprovantes } from './Comprovantes'

// Fatura com vários comprovantes no mesmo mês é a acolhida (um por semana). O caso de um
// comprovante só — quase todo mundo — tem que continuar sendo link direto, sem seletor.

describe('Comprovantes', () => {
  it('vários comprovantes viram seletor de semana', async () => {
    render(<Comprovantes payment={{
      proofs: [
        { weekId: '2026-09-07', url: 'http://s/1.jpg' },
        { weekId: '2026-09-14', url: 'http://s/2.jpg' },
      ],
    }} />)

    const seletor = screen.getByLabelText(/semana do comprovante/i)
    expect(screen.getByRole('link', { name: /^ver$/i })).toHaveAttribute('href', 'http://s/1.jpg')

    await userEvent.selectOptions(seletor, '1')
    expect(screen.getByRole('link', { name: /^ver$/i })).toHaveAttribute('href', 'http://s/2.jpg')
  })

  it('um comprovante por semana mostra a data da entrega, sem seletor', () => {
    render(<Comprovantes payment={{ proofs: [{ weekId: '2026-09-07', url: 'http://s/1.jpg' }] }} />)
    expect(screen.getByRole('link', { name: 'Ver (09/09)' })).toHaveAttribute('href', 'http://s/1.jpg')
    expect(screen.queryByLabelText(/semana do comprovante/i)).not.toBeInTheDocument()
  })

  it('só o proofUrl legado continua sendo link direto', () => {
    render(<Comprovantes payment={{ proofUrl: 'http://s/unico.jpg' }} />)
    expect(screen.getByRole('link', { name: 'Ver comprovante' })).toHaveAttribute('href', 'http://s/unico.jpg')
    expect(screen.queryByLabelText(/semana do comprovante/i)).not.toBeInTheDocument()
  })

  it('compacto encurta o rótulo (cabe na coluna da tabela)', () => {
    render(<Comprovantes payment={{ proofUrl: 'http://s/unico.jpg' }} compacto />)
    expect(screen.getByRole('link', { name: 'Ver' })).toBeInTheDocument()
  })

  it('fatura sem comprovante nenhum não oferece link', () => {
    render(<Comprovantes payment={{}} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
