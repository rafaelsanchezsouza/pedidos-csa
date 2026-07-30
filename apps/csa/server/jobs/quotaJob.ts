import cron from 'node-cron'
import { listDocs } from '../repositories/firestore.js'
import { generateQuotaForAll, generateFreteForAll } from '../services/paymentService.js'

interface ColmeiaDoc {
  name: string
}

export function startQuotaJob(): void {
  // Executa às 08h do dia 1 de cada mês
  cron.schedule('0 8 1 * *', async () => {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    console.log(`[quotaJob] Gerando cotas para ${month}`)

    const colmeias = await listDocs<ColmeiaDoc>('colmeias')
    await Promise.all(
      colmeias.map(async (c) => {
        try {
          const cotas = await generateQuotaForAll(c.id, month)
          const fretes = await generateFreteForAll(c.id, month)
          console.log(`[quotaJob] ${c.name}: ${cotas.generated} cotas, ${fretes.generated} fretes gerados`)
        } catch (err) {
          console.error(`[quotaJob] Erro na colmeia ${c.name}:`, err)
        }
      }),
    )
  })

  console.log('[quotaJob] Agendado: dia 1 de cada mês às 08h')
}
