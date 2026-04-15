import cron from 'node-cron'
import { listDocs, db } from '../repositories/firestore.js'
import { getProducerMessages } from '../services/ordersService.js'
import { sendWhatsAppMessage } from '../services/whatsapp/index.js'

function getWeekStart(date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function startSendOrdersJob(): void {
  // Toda terça-feira às 6h (horário do servidor)
  cron.schedule('0 6 * * 2', async () => {
    const weekId = getWeekStart()
    console.log(`[sendOrdersJob] Enviando pedidos da semana ${weekId}`)

    const colmeias = await listDocs<{ name: string }>('colmeias')
    for (const colmeia of colmeias) {
      try {
        const messages = await getProducerMessages(colmeia.id, weekId)
        if (messages.length === 0) {
          console.log(`[sendOrdersJob] ${colmeia.name}: sem pedidos, ignorando`)
          continue
        }
        for (const { contact, text } of messages) {
          try {
            await sendWhatsAppMessage(contact, text)
          } catch (err) {
            console.error(`[sendOrdersJob] ${colmeia.name}: erro ao enviar para ${contact}:`, err)
          }
        }
        await db.collection('week_locks').doc(`${colmeia.id}_${weekId}`).set({
          colmeiaId: colmeia.id,
          weekId,
          lockedAt: new Date().toISOString(),
        })
        console.log(`[sendOrdersJob] ${colmeia.name}: ${messages.length} produtor(es) notificado(s), semana bloqueada`)
      } catch (err) {
        console.error(`[sendOrdersJob] Erro na colmeia ${colmeia.name}:`, err)
      }
    }
  })

  console.log('[sendOrdersJob] Agendado: terças-feiras às 6h')
}
