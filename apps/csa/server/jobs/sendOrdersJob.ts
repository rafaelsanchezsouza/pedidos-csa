import cron from 'node-cron'
import { getWeekStart } from '@pedidos/core'
import { listDocs } from '../repositories/firestore.js'
import { ordersService } from '../services/orders.js'
import { whatsapp } from '../adapters.js'
import { config } from '../../src/config.js'

interface TenantDoc {
  name: string
  orderSendDay?: number   // 0-6
  orderSendHour?: number  // 0-23
}

async function enviarParaTenant(tenant: TenantDoc & { id: string }, weekId: string) {
  const messages = await ordersService.getProducerMessages(tenant.id, weekId)
  if (messages.length === 0) {
    console.log(`[sendOrdersJob] ${tenant.name}: sem pedidos, ignorando`)
    return
  }
  for (const { contact, text } of messages) {
    try {
      await whatsapp.sendMessage(contact, text)
    } catch (err) {
      console.error(`[sendOrdersJob] ${tenant.name}: erro ao enviar para ${contact}:`, err)
    }
  }
  await ordersService.lockWeek(tenant.id, weekId)
  console.log(`[sendOrdersJob] ${tenant.name}: ${messages.length} produtor(es) notificado(s), semana bloqueada`)
}

export function startSendOrdersJob(): void {
  // Executa toda hora; cada tenant define seu próprio dia/hora de envio
  cron.schedule('0 * * * *', async () => {
    const now = new Date()
    const currentDay = now.getDay()    // 0-6
    const currentHour = now.getHours() // 0-23
    const weekId = getWeekStart()

    const tenants = await listDocs<TenantDoc>('tenants')
    for (const tenant of tenants) {
      const sendDay = tenant.orderSendDay ?? config.tenantDefaults.orderSendDay
      const sendHour = tenant.orderSendHour ?? config.tenantDefaults.orderSendHour
      if (currentDay !== sendDay || currentHour !== sendHour) continue

      if (await ordersService.isWeekLocked(tenant.id, weekId)) {
        console.log(`[sendOrdersJob] ${tenant.name}: semana já bloqueada, ignorando`)
        continue
      }

      try {
        await enviarParaTenant(tenant, weekId)
      } catch (err) {
        console.error(`[sendOrdersJob] Erro na colmeia ${tenant.name}:`, err)
      }
    }
  })

  console.log('[sendOrdersJob] Agendado: verificação horária (dia/hora configurável por colmeia)')
}
