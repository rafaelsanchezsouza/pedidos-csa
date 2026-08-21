// Instância única do serviço de pagamentos do engine, com o repo e a config do app.
// Consumida pelo router (boot), pelo orders e pelo quotaJob.
import { createPaymentService } from '@pedidos/core/server'
import { repo } from '../repositories/firestore.js'
import { config } from '../../src/config.js'

export const paymentService = createPaymentService({ repo }, config)
