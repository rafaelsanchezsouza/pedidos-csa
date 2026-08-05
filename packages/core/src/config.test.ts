import { describe, it, expect } from 'vitest'
import { defineAppConfig, validateAppConfig, type AppConfig } from './config'

const base: AppConfig = {
  brand: { name: 'X', tagline: 't', icon: '/i.png', colors: { light: {}, dark: {} } },
  vocabulary: { pickupLabel: 'Retirada', otpAppName: 'X' },
  capabilities: { offeringSource: 'from-catalog', multiTenant: false, paymentStrategy: 'monthly-post' },
  tenantDefaults: {
    quotaTerm: 'Cota',
    quotas: [{ name: 'Cota inteira', price: 65 }],
    quotaInteira: 65,
    quotaMeia: 40,
    roleDefaults: [],
    dueDay: 10,
    orderSendDay: 2,
    orderSendHour: 6,
    weekChangeDay: 0,
  },
}

describe('defineAppConfig', () => {
  it('devolve a mesma config (identidade)', () => {
    expect(defineAppConfig(base)).toBe(base)
  })
})

describe('validateAppConfig', () => {
  it('config válida não gera erro', () => {
    expect(validateAppConfig(base)).toEqual([])
  })

  it('parse-message exige messageParser', () => {
    const c: AppConfig = { ...base, capabilities: { ...base.capabilities, offeringSource: 'parse-message' } }
    expect(validateAppConfig(c)).toContain(
      "capabilities.messageParser é obrigatório quando offeringSource='parse-message'",
    )
  })

  it('parse-message com parser é válida', () => {
    const c: AppConfig = {
      ...base,
      capabilities: { ...base.capabilities, offeringSource: 'parse-message', messageParser: 'fuzzy' },
    }
    expect(validateAppConfig(c)).toEqual([])
  })

  it('from-catalog não deve ter messageParser', () => {
    const c: AppConfig = { ...base, capabilities: { ...base.capabilities, messageParser: 'openai' } }
    expect(validateAppConfig(c)).toContain(
      "capabilities.messageParser não se aplica a offeringSource='from-catalog'",
    )
  })

  it('quotas vazio é erro', () => {
    const c: AppConfig = { ...base, tenantDefaults: { ...base.tenantDefaults, quotas: [] } }
    expect(validateAppConfig(c)).toContain('tenantDefaults.quotas não pode ser vazio')
  })

  it('campos de agenda fora de faixa são erro', () => {
    const c: AppConfig = {
      ...base,
      tenantDefaults: { ...base.tenantDefaults, dueDay: 31, orderSendDay: 9, orderSendHour: 25, weekChangeDay: 7 },
    }
    const errs = validateAppConfig(c)
    expect(errs).toHaveLength(4)
  })
})
