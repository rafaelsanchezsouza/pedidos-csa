import { describe, it, expect } from 'vitest'
import type { User } from '@/types'
import { sortByDeliveryOrder, mergeReorder } from './deliveryOrder'

type U = Pick<User, 'id' | 'name' | 'deliveryOrder'>
const u = (id: string, name: string, deliveryOrder?: number): U => ({ id, name, deliveryOrder })

describe('sortByDeliveryOrder', () => {
  it('ordena por deliveryOrder crescente', () => {
    const r = sortByDeliveryOrder([u('a', 'Ana', 2), u('b', 'Bruno', 0), u('c', 'Caio', 1)])
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('quem não tem ordem cai no fim, alfabético', () => {
    const r = sortByDeliveryOrder([u('a', 'Zeca'), u('b', 'Bruno', 0), u('c', 'Ana')])
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']) // Bruno (ordenado), depois Ana, Zeca
  })

  it('nome desempata ordens iguais', () => {
    const r = sortByDeliveryOrder([u('a', 'Zeca', 0), u('b', 'Ana', 0)])
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('respeita acentuação pt-BR', () => {
    const r = sortByDeliveryOrder([u('a', 'Ávila'), u('b', 'Ana')])
    expect(r.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('não muta o array original', () => {
    const orig = [u('a', 'Ana', 1), u('b', 'Bruno', 0)]
    sortByDeliveryOrder(orig)
    expect(orig.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('mergeReorder', () => {
  it('sem ocultos: usa a nova ordem visível tal e qual', () => {
    const all = [u('a', 'Ana', 0), u('b', 'Bruno', 1), u('c', 'Caio', 2)]
    expect(mergeReorder(all, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })

  // O caso que a feature exige: reordenar numa semana onde 'b' não aparece (quinzenal fora).
  // 'b' está entre 'a' e 'c'; deve continuar entre eles depois do reorder dos visíveis.
  it('preserva a posição do oculto entre visíveis', () => {
    const all = [u('a', 'Ana', 0), u('b', 'Bruno', 1), u('c', 'Caio', 2)]
    // admin vê [a, c] e inverte para [c, a]
    const r = mergeReorder(all, ['c', 'a'])
    // slots de visíveis (0 e 2) recebem c e a; slot 1 (oculto b) fica
    expect(r).toEqual(['c', 'b', 'a'])
  })

  it('oculto no fim permanece no fim', () => {
    const all = [u('a', 'Ana', 0), u('b', 'Bruno', 1), u('z', 'Zeca', 2)]
    const r = mergeReorder(all, ['b', 'a']) // z oculto, era o último
    expect(r).toEqual(['b', 'a', 'z'])
  })

  it('oculto no começo permanece no começo', () => {
    const all = [u('z', 'Zeca', 0), u('a', 'Ana', 1), u('b', 'Bruno', 2)]
    const r = mergeReorder(all, ['b', 'a']) // z oculto, era o primeiro
    expect(r).toEqual(['z', 'b', 'a'])
  })

  it('resultado é permutação: mesmos ids, sem perda nem duplicata', () => {
    const all = [u('a', 'Ana', 0), u('b', 'Bruno', 1), u('c', 'Caio', 2), u('d', 'Duda', 3)]
    const r = mergeReorder(all, ['c', 'a']) // b e d ocultos
    expect([...r].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
