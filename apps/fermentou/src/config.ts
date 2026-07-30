// Config do app Fermentou (padaria). Fonte única do que difere do motor.
// Integrações/env (Firebase, WhatsApp instance, OpenAI) NÃO ficam aqui — entram no boot do
// server a partir do .env.

import { defineAppConfig } from '@pedidos/core'
import { BRAND } from './lib/brand'
import { MULTI_TENANT } from './lib/features'

export const config = defineAppConfig({
  brand: BRAND,
  vocabulary: {
    pickupLabel: 'Retirada',
    otpAppName: BRAND.name,
  },
  capabilities: {
    offeringSource: 'from-catalog', // padaria gera a oferta do catálogo (sem parseMessage)
    multiTenant: MULTI_TENANT,
    paymentStrategy: 'monthly-post',
  },
  tenantDefaults: {
    quotaTerm: 'Fornada',
    quotas: [
      { name: 'Fornada Completa', price: 65 },
      { name: 'Fornada Leve', price: 40 },
    ],
    quotaInteira: 65,
    quotaMeia: 40,
    roleDefaults: [], // padaria não usa função no coletivo (era vocabulário da CSA)
    dueDay: 10,
    orderSendDay: 2, // terça
    orderSendHour: 6,
    weekChangeDay: 0, // domingo
    pickupValue: 'retirada',
  },
})
