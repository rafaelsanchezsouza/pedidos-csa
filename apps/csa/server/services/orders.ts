// Instância única do serviço de pedidos do engine, com o repo e a config do app.
import { createOrdersService } from '@pedidos/core/server'
import { repo } from '../repositories/firestore.js'
import { config } from '../../src/config.js'

export const ordersService = createOrdersService({ repo }, config)
