import cron from 'node-cron'
import { relogioDoTenant, UTC_OFFSET_PADRAO } from '@pedidos/core'
import { config } from '../../src/config.js'
import { listDocs } from '../repositories/firestore.js'
import { paymentService } from '../services/payments.js'

interface TenantDoc {
  name: string
}

export function startQuotaJob(): void {
  // Executa às 08h do dia 1 de cada mês
  cron.schedule('0 8 1 * *', async () => {
    // Mês no fuso do tenant. Hoje o cron dispara às 08:00 UTC (05:00 BRT) e o mês bateria de
    // qualquer jeito, mas ler o relógio do processo é o que já gerou fatura no mês errado em
    // outras contas — a virada do dia 1 é exatamente onde 3 horas de diferença mudam o mês.
    const month = relogioDoTenant(new Date(), config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO)
      .data.slice(0, 7)
    console.log(`[quotaJob] Gerando cotas para ${month}`)

    const tenants = await listDocs<TenantDoc>('tenants')
    await Promise.all(
      tenants.map(async (c) => {
        try {
          const cotas = await paymentService.generateQuotaForAll(c.id, month)
          const fretes = await paymentService.generateFreteForAll(c.id, month)
          console.log(`[quotaJob] ${c.name}: ${cotas.generated} cotas, ${fretes.generated} fretes gerados`)
        } catch (err) {
          console.error(`[quotaJob] Erro na tenant ${c.name}:`, err)
        }
      }),
    )
  })

  console.log('[quotaJob] Agendado: dia 1 de cada mês às 08h')
}
