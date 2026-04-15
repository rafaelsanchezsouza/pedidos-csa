import cron from 'node-cron'
import { listDocs, db } from '../repositories/firestore.js'
import { getProducerMessages } from '../services/ordersService.js'
import { sendWhatsAppMessage } from '../services/whatsapp/index.js'

interface ColmeiaDoc {
  name: string
  orderSendDay?: number   // 0-6, default 2 (terça)
  orderSendHour?: number  // 0-23, default 6
}

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

async function enviarParaColmeia(colmeia: ColmeiaDoc & { id: string }, weekId: string) {
  const messages = await getProducerMessages(colmeia.id, weekId)
  if (messages.length === 0) {
    console.log(`[sendOrdersJob] ${colmeia.name}: sem pedidos, ignorando`)
    return
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
}

export function startSendOrdersJob(): void {
  // Executa toda hora; cada colmeia define seu próprio dia/hora de envio
  cron.schedule('0 * * * *', async () => {
    const now = new Date()
    const currentDay = now.getDay()    // 0-6
    const currentHour = now.getHours() // 0-23
    const weekId = getWeekStart()

    const colmeias = await listDocs<ColmeiaDoc>('colmeias')
    for (const colmeia of colmeias) {
      const sendDay = colmeia.orderSendDay ?? 2   // default: terça (2)
      const sendHour = colmeia.orderSendHour ?? 6  // default: 6h
      if (currentDay !== sendDay || currentHour !== sendHour) continue

      const lockSnap = await db.collection('week_locks').doc(`${colmeia.id}_${weekId}`).get()
      if (lockSnap.exists) {
        console.log(`[sendOrdersJob] ${colmeia.name}: semana já bloqueada, ignorando`)
        continue
      }

      try {
        await enviarParaColmeia(colmeia, weekId)
      } catch (err) {
        console.error(`[sendOrdersJob] Erro na colmeia ${colmeia.name}:`, err)
      }
    }
  })

  console.log('[sendOrdersJob] Agendado: verificação horária (dia/hora configurável por colmeia)')
}
