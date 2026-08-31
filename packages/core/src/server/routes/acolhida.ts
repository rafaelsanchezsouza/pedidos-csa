import { Router, type Request, type Response } from 'express'
import { carregarAtor, ehAdmin, negar } from '../auth.js'
import { podeConfirmar, prazoConfirmacao, UTC_OFFSET_PADRAO } from '../../domain/acolhida.js'
import type { AcolhidaWeekDoc, DeliveryType, UserDoc } from '../../types.js'
import type { AppConfig } from '../../config.js'
import type { EngineDeps, WhereFilter } from '../repo.js'
import type { PaymentService } from '../services/payments.js'

export interface AcolhidaDeps extends EngineDeps {
  payments: PaymentService
}

const mesDa = (weekId: string): string => weekId.slice(0, 7)

export function createAcolhidaRouter({ repo, payments }: AcolhidaDeps, config: AppConfig): Router {
  const router = Router()
  const utcOffset = config.tenantDefaults.utcOffset ?? UTC_OFFSET_PADRAO

  const chave = (userId: string, tenantId: string, weekId: string): WhereFilter[] => [
    ['userId', '==', userId],
    ['tenantId', '==', tenantId],
    ['weekId', '==', weekId],
  ]

  // GET /acolhida/:weekId — a confirmação daquela semana. `?userId=` só para admin.
  router.get('/:weekId', async (req: Request, res: Response) => {
    try {
      const ator = await carregarAtor(repo, req.user!.uid)
      const alvo = (req.query.userId as string) || ator.uid
      // O tenant vem do RECURSO (o doc do usuário alvo), nunca do header.
      const dono = await repo.getDoc<UserDoc>('users', alvo)
      if (!dono) { res.status(404).json({ message: 'Usuário não encontrado' }); return }
      if (alvo !== ator.uid && !ehAdmin(ator, dono.tenantId)) { negar(res); return }

      const weekId = String(req.params.weekId)
      const docs = await repo.listDocs<AcolhidaWeekDoc>('acolhidaWeeks', chave(alvo, dono.tenantId, weekId))
      res.json({
        confirmacao: docs[0] ?? null,
        prazo: prazoConfirmacao(weekId, utcOffset).toISOString(),
        aberto: podeConfirmar(weekId, new Date(), utcOffset),
      })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /acolhida — confirma (ou desmarca) a semana e recalcula as faturas do mês.
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { weekId, confirmado, deliveryType, userId } = req.body as {
        weekId?: string; confirmado?: boolean; deliveryType?: string; userId?: string
      }
      if (!weekId || !/^\d{4}-\d{2}-\d{2}$/.test(weekId)) {
        res.status(400).json({ message: 'weekId inválido' }); return
      }
      if (typeof confirmado !== 'boolean') {
        res.status(400).json({ message: 'confirmado é obrigatório' }); return
      }
      if (confirmado && deliveryType !== 'entrega' && deliveryType !== 'retirada') {
        res.status(400).json({ message: 'Escolha entre receber em casa ou retirar' }); return
      }

      const ator = await carregarAtor(repo, req.user!.uid)
      const alvo = userId || ator.uid
      const dono = await repo.getDoc<UserDoc>('users', alvo)
      if (!dono) { res.status(404).json({ message: 'Usuário não encontrado' }); return }
      const admin = ehAdmin(ator, dono.tenantId)
      if (alvo !== ator.uid && !admin) { negar(res); return }

      // O prazo vale para o membro; o admin corrige depois (alguém avisa por telefone, chega
      // atrasado, erra o clique). Sem essa saída, a única correção seria mexer no banco.
      if (!admin && !podeConfirmar(weekId, new Date(), utcOffset)) {
        res.status(409).json({
          message: 'O prazo desta semana encerrou na segunda-feira às 23h59. Fale com a organização.',
          prazo: prazoConfirmacao(weekId, utcOffset).toISOString(),
        })
        return
      }

      const tenantId = dono.tenantId
      const existentes = await repo.listDocs<AcolhidaWeekDoc>('acolhidaWeeks', chave(alvo, tenantId, weekId))
      const agora = new Date().toISOString()
      const dados = {
        userId: alvo, tenantId, weekId, confirmado,
        deliveryType: (confirmado ? deliveryType : (existentes[0]?.deliveryType ?? dono.deliveryType)) as DeliveryType,
        dateUpdated: agora,
      }
      if (existentes[0]) {
        await repo.updateDoc<AcolhidaWeekDoc>('acolhidaWeeks', existentes[0].id, dados)
      } else {
        await repo.createDoc<AcolhidaWeekDoc>('acolhidaWeeks', { ...dados, dateCreated: agora } as AcolhidaWeekDoc)
      }

      // A fatura do mês é derivada das semanas: mudou a semana, recalcula. Sem isto o valor
      // ficaria congelado no que a última geração viu.
      const month = mesDa(weekId)
      await payments.generateQuotaForUser(alvo, tenantId, month).catch(() => undefined)
      await payments.generateFreteForUser(alvo, tenantId, month).catch(() => undefined)

      res.json({ ok: true, weekId, confirmado, deliveryType: dados.deliveryType })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
