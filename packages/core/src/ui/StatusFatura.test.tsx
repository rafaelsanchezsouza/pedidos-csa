// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusFatura } from './StatusFatura'

// Dar fatura por paga sem comprovante é confirmar dinheiro sem evidência: nunca um clique só.

describe('StatusFatura', () => {
  it('Pendente abre confirmação; cancelar não altera nada', async () => {
    const onAlterar = vi.fn(async () => {})
    render(<StatusFatura payment={{ verified: false }} podeAlterar descricao="Ana · Cota" onAlterar={onAlterar} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pendente' }))
    expect(screen.getByText(/sem comprovante\?/i)).toBeInTheDocument()
    expect(screen.getByText('Ana · Cota')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onAlterar).not.toHaveBeenCalled()
  })

  it('confirmar marca como verificado', async () => {
    const onAlterar = vi.fn(async () => {})
    render(<StatusFatura payment={{ verified: false }} podeAlterar descricao="x" onAlterar={onAlterar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pendente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como verificado' }))
    expect(onAlterar).toHaveBeenCalledWith(true)
  })

  it('Verificado desfaz, também com confirmação', async () => {
    const onAlterar = vi.fn(async () => {})
    render(<StatusFatura payment={{ verified: true, proofUrl: 'http://s/1.jpg' }} podeAlterar descricao="x" onAlterar={onAlterar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Verificado' }))
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(onAlterar).toHaveBeenCalledWith(false)
  })

  it('falha do servidor aparece no dialog, que continua aberto', async () => {
    const onAlterar = vi.fn(async () => { throw new Error('Sem permissão') })
    render(<StatusFatura payment={{ verified: false }} podeAlterar descricao="x" onAlterar={onAlterar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Pendente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como verificado' }))
    expect(screen.getByText('Sem permissão')).toBeInTheDocument()
  })

  it('aguardando verificação não é atalho (tem comprovante: o caminho é o botão Verificar)', () => {
    render(<StatusFatura payment={{ verified: false, proofUrl: 'http://s/1.jpg' }} podeAlterar descricao="x" onAlterar={vi.fn()} />)
    expect(screen.getByText('Aguardando verificação')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sem podeAlterar é só o badge', () => {
    render(<StatusFatura payment={{ verified: false }} descricao="x" onAlterar={vi.fn()} />)
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
