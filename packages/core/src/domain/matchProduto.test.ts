import { describe, it, expect } from 'vitest'
import { melhorMatch, similaridadeNome, LIMIAR_MATCH } from './matchProduto.js'

const catalogo = [
  { id: 'p1', name: 'Macaxeira' },
  { id: 'p2', name: 'Maçã' },
  { id: 'p3', name: 'Alface crespa' },
]

describe('melhorMatch', () => {
  it('casa ignorando acento e caixa', () => {
    expect(melhorMatch('MACA', [{ id: 'p2', name: 'Maçã' }])?.id).toBe('p2')
  })

  it('o nome cru da mensagem não casa; corrigido, casa — é o caso da tela', () => {
    expect(melhorMatch('Macaxeira Natural kg', catalogo)).toBeUndefined()
    expect(melhorMatch('Macaxeira', catalogo)?.id).toBe('p1')
  })

  it('nome vazio é produto novo, não match com catálogo vazio de nome', () => {
    expect(melhorMatch('  ', [{ id: 'x', name: '' }])).toBeUndefined()
  })

  it('escolhe o de maior similaridade, não o primeiro acima do limiar', () => {
    const c = [{ id: 'a', name: 'Alface lisa' }, { id: 'b', name: 'Alface crespa' }]
    expect(melhorMatch('Alface crespas', c)?.id).toBe('b')
  })

  it('abaixo do limiar não casa', () => {
    expect(similaridadeNome('Banana', 'Macaxeira')).toBeLessThan(LIMIAR_MATCH)
    expect(melhorMatch('Banana', catalogo)).toBeUndefined()
  })
})
