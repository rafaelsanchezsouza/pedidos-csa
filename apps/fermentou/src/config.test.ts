import { describe, it, expect } from 'vitest'
import { validateAppConfig } from '@pedidos/core'
import { config } from './config'

describe('config do Fermentou', () => {
  it('passa na validação do AppConfig', () => {
    expect(validateAppConfig(config)).toEqual([])
  })

  it('gera a oferta do catálogo (sem parseMessage)', () => {
    expect(config.capabilities.offeringSource).toBe('from-catalog')
    expect(config.capabilities.messageParser).toBeUndefined()
  })

  it('vocabulário de padaria', () => {
    expect(config.tenantDefaults.quotaTerm).toBe('Fornada')
    expect(config.tenantDefaults.roleDefaults).toEqual([])
    expect(config.tenantDefaults.pickupValue).toBe('retirada')
  })
})
