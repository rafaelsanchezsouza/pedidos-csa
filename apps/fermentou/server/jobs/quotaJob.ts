import cron from 'node-cron'
import { relogioDoTenant, UTC_OFFSET_PADRAO } from '@pedidos/core'
import { config } from '../../src/config.js'
import { listDocs, getDoc } from '../repositories/firestore.js'
import { paymentService } from '../services/payments.js'
import { whatsapp } from '../adapters.js'

interface TenantDoc {
  name: string
  responsavelEntregasId?: string
}

// Quem recebe em casa e não tem preço de frete não gera fatura — fica invisível até alguém
// olhar a tela. O aviso sai SÓ por aqui, que é o caminho desatendido: no botão "Gerar
// faturas" o admin está olhando a lista, e mandar zap ali seria ruído.
async function avisarPendencias(
  tenant: TenantDoc & { id: string },
  month: string,
  semFrete: Array<{ userName: string; neighborhood?: string }>,
): Promise<void> {
  if (semFrete.length === 0) return
  if (!tenant.responsavelEntregasId) {
    console.warn(`[quotaJob] ${tenant.name}: ${semFrete.length} sem frete e nenhum responsável definido`)
    return
  }
  const responsavel = await getDoc<{ name: string; contact?: string }>('users', tenant.responsavelEntregasId)
  if (!responsavel?.contact) {
    console.warn(`[quotaJob] ${tenant.name}: responsável por entregas sem contato cadastrado`)
    return
  }
  const linhas = semFrete.map((p) => `- ${p.userName}${p.neighborhood ? ` (${p.neighborhood})` : ' (sem bairro)'}`)
  const texto = [
    `*${tenant.name}* — frete de ${month}`,
    '',
    `${semFrete.length} membro(s) de entrega sem preço de frete. Nenhuma fatura foi gerada para eles:`,
    ...linhas,
    '',
    'Defina o preço do bairro em Configurações → Entregas, ou um frete próprio no cadastro.',
  ].join('\n')
  // Falhar o envio não pode derrubar a geração: a fatura já foi gravada.
  await whatsapp.sendMessage(responsavel.contact, texto).catch((err: unknown) => {
    console.error(`[quotaJob] Falha ao avisar o responsável de ${tenant.name}:`, err)
  })
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
          console.log(
            `[quotaJob] ${c.name}: ${cotas.generated} cotas, ${fretes.generated} fretes gerados` +
            (fretes.semFrete.length ? `, ${fretes.semFrete.length} sem frete definido` : ''),
          )
          await avisarPendencias(c, month, fretes.semFrete)
        } catch (err) {
          console.error(`[quotaJob] Erro na tenant ${c.name}:`, err)
        }
      }),
    )
  })

  console.log('[quotaJob] Agendado: dia 1 de cada mês às 08h')
}
