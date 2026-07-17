// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EstadoLista } from './EstadoLista'

const conteudo = <ul><li>Item</li></ul>

describe('EstadoLista', () => {
  it('mostra carregando e esconde o conteúdo', () => {
    render(<EstadoLista loading vazio={false} mensagemVazia="Nada aqui">{conteudo}</EstadoLista>)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
    expect(screen.queryByText('Item')).not.toBeInTheDocument()
  })

  it('mostra a mensagem de vazio', () => {
    render(<EstadoLista loading={false} vazio mensagemVazia="Nenhum membro">{conteudo}</EstadoLista>)
    expect(screen.getByText('Nenhum membro')).toBeInTheDocument()
    expect(screen.queryByText('Item')).not.toBeInTheDocument()
  })

  it('mostra o conteúdo quando carregou e não está vazio', () => {
    render(<EstadoLista loading={false} vazio={false} mensagemVazia="Nada aqui">{conteudo}</EstadoLista>)
    expect(screen.getByText('Item')).toBeInTheDocument()
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument()
  })

  // Durante o carregamento a lista está vazia — anunciar "nenhum resultado" antes de os
  // dados chegarem é mentira, então loading vence vazio.
  it('carregando vence vazio', () => {
    render(<EstadoLista loading vazio mensagemVazia="Nenhum membro">{conteudo}</EstadoLista>)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum membro')).not.toBeInTheDocument()
  })
})
