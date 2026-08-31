import { describe, it, expect } from 'vitest'
import { emAcolhida, hojeNoFuso, prazoConfirmacao, podeConfirmar, semanasConfirmadas, fimDaAcolhida } from './acolhida'

const BR = -3

// O valor destes testes está em rodarem sob TZ=BR, UTC e UTC+14 (test:tz): se alguma conta
// escorregar para os getters locais, o resultado muda com o fuso do processo e o teste quebra.
describe('hojeNoFuso', () => {
  it('não depende do fuso do processo', () => {
    // 2026-08-31T01:25Z: já é dia 31 em UTC, ainda é dia 30 em Brasília.
    const agora = new Date('2026-08-31T01:25:00Z')
    expect(hojeNoFuso(agora, BR)).toBe('2026-08-30')
    expect(hojeNoFuso(agora, 0)).toBe('2026-08-31')
  })
})

describe('emAcolhida', () => {
  it('vale até o fim do dia do vencimento, no fuso do tenant', () => {
    const u = { acolhidaExpiry: '2026-08-30' }
    expect(emAcolhida(u, new Date('2026-08-31T01:25:00Z'), BR)).toBe(true)   // 30/08 em BRT
    expect(emAcolhida(u, new Date('2026-08-31T04:00:00Z'), BR)).toBe(false)  // já é 31 em BRT
  })

  it('sem acolhidaExpiry é membro efetivo', () => {
    expect(emAcolhida({}, new Date(), BR)).toBe(false)
  })
})

describe('prazo de confirmação', () => {
  const semana = '2026-08-31'  // uma segunda-feira

  it('é segunda 23:59:59 no fuso do tenant, não do servidor', () => {
    // 23:59:59 BRT = 02:59:59 UTC de terça.
    expect(prazoConfirmacao(semana, BR).toISOString()).toBe('2026-09-01T02:59:59.999Z')
    expect(prazoConfirmacao(semana, 0).toISOString()).toBe('2026-08-31T23:59:59.999Z')
  })

  it('membro que confirma 23:30 de segunda em Brasília consegue', () => {
    expect(podeConfirmar(semana, new Date('2026-09-01T02:30:00Z'), BR)).toBe(true)
  })

  it('meia-noite e um de terça em Brasília já passou', () => {
    expect(podeConfirmar(semana, new Date('2026-09-01T03:01:00Z'), BR)).toBe(false)
  })

  it('o pedido ao produtor sai depois do prazo (terça 03:00 BRT)', () => {
    const envio = new Date('2026-09-01T06:00:00Z')       // 06:00 UTC = 03:00 BRT
    expect(envio.getTime()).toBeGreaterThan(prazoConfirmacao(semana, BR).getTime())
  })

  it('semana futura pode ser confirmada com antecedência', () => {
    expect(podeConfirmar('2026-09-07', new Date('2026-09-01T12:00:00Z'), BR)).toBe(true)
  })
})

describe('semanasConfirmadas', () => {
  const docs = [
    { weekId: '2026-09-07', confirmado: true },
    { weekId: '2026-09-14', confirmado: true },
    { weekId: '2026-09-21', confirmado: false },   // disse que não
    { weekId: '2026-08-31', confirmado: true },    // outro mês
  ]

  it('conta só as confirmadas do mês', () => {
    expect(semanasConfirmadas(docs, '2026-09')).toBe(2)
  })

  it('a semana pertence ao mês da segunda, como nos pedidos', () => {
    expect(semanasConfirmadas(docs, '2026-08')).toBe(1)
  })

  it('sem confirmação nenhuma, não há o que cobrar', () => {
    expect(semanasConfirmadas([], '2026-09')).toBe(0)
  })
})

describe('fimDaAcolhida', () => {
  it('conta 30 dias no fuso do tenant, não no do servidor', () => {
    // 01:25Z de 31/08 ainda é 30/08 em Brasília → 30 dias a partir de 30/08.
    expect(fimDaAcolhida(new Date('2026-08-31T01:25:00Z'), BR)).toBe('2026-09-29')
    expect(fimDaAcolhida(new Date('2026-08-31T01:25:00Z'), 0)).toBe('2026-09-30')
  })

  it('o membro cadastrado hoje ainda está em acolhida no último dia', () => {
    const agora = new Date('2026-08-31T15:00:00Z')
    const fim = fimDaAcolhida(agora, BR)
    expect(emAcolhida({ acolhidaExpiry: fim }, new Date(`${fim}T23:00:00Z`), BR)).toBe(true)
  })
})
