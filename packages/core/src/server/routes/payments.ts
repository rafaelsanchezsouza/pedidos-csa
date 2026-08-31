import { Router, type Request, type Response } from 'express'
import type { EngineDeps } from '../repo.js'
import type { PaymentService, PaymentDoc } from '../services/payments.js'
import '../types.js'
import { carregarAtor, ehAdmin, ehAdminOuFornecedor, negar } from '../auth.js'

export interface PaymentsDeps extends EngineDeps {
  payments: PaymentService
}

export function createPaymentsRouter({ repo, payments }: PaymentsDeps): Router {
  const router = Router()

  // POST /quota — cria/atualiza pagamento de cota do mês do próprio usuário
  router.post('/quota', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const result = await payments.generateQuotaForUser(req.user!.uid, tenantId, month)
      res.json(result)
    } catch (err) {
      const msg = String(err)
      if (msg.includes('sem cota definida')) { res.status(400).json({ message: msg }); return }
      res.status(500).json({ message: msg })
    }
  })

  // POST /quota/all — garante doc de cota para todos os membros elegíveis (admin)
  router.post('/quota/all', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const ator = await carregarAtor(repo, req.user!.uid)
      if (!ehAdmin(ator, tenantId)) { negar(res); return }
      res.json(await payments.generateQuotaForAll(tenantId, month))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /frete — cria/atualiza a fatura de frete do mês do próprio usuário
  router.post('/frete', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      res.json(await payments.generateFreteForUser(req.user!.uid, tenantId, month))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /frete/all — gera fatura de frete para todos os membros de entrega (admin)
  router.post('/frete/all', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.body.tenantId as string) || req.tenantId
      const month = req.body.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const ator = await carregarAtor(repo, req.user!.uid)
      if (!ehAdmin(ator, tenantId)) { negar(res); return }
      res.json(await payments.generateFreteForAll(tenantId, month))
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /my?month=YYYY-MM&tenantId=
  router.get('/my', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const month = req.query.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      // Sem gate: já está filtrado por userId — é a fatura de quem chama.
      const list = await repo.listDocs<PaymentDoc>('payments', [
        ['userId', '==', req.user!.uid],
        ['tenantId', '==', tenantId],
        ['month', '==', month],
      ])
      res.json(list)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // GET /?month=YYYY-MM&tenantId= (admin)
  router.get('/', async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || req.tenantId
      const month = req.query.month as string
      if (!tenantId || !month) { res.status(400).json({ message: 'tenantId e month obrigatórios' }); return }
      const ator = await carregarAtor(repo, req.user!.uid)
      if (!ehAdminOuFornecedor(ator, tenantId)) { negar(res); return }
      const list = await repo.listDocs<PaymentDoc>('payments', [
        ['tenantId', '==', tenantId],
        ['month', '==', month],
      ])
      res.json(list)
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // POST /:id/comprovante — o dono anexa o comprovante de UMA semana (acolhida).
  // Endpoint próprio em vez de deixar o dono escrever `proofs` inteiro no PUT: assim ele
  // acrescenta, nunca reescreve a lista (nem apaga um comprovante já conferido).
  router.post('/:id/comprovante', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string
      const { weekId, url } = req.body as { weekId?: string; url?: string }
      if (!weekId || !/^\d{4}-\d{2}-\d{2}$/.test(weekId)) { res.status(400).json({ message: 'weekId inválido' }); return }
      if (!url) { res.status(400).json({ message: 'url do comprovante é obrigatória' }); return }

      const atual = await repo.getDoc<PaymentDoc>('payments', id)
      if (!atual) { res.status(404).json({ message: 'Fatura não encontrada' }); return }
      const ator = await carregarAtor(repo, req.user!.uid)
      if (atual.userId !== ator.uid && !ehAdmin(ator, atual.tenantId)) { negar(res); return }

      const agora = new Date().toISOString()
      // Reenviar a mesma semana SUBSTITUI (o membro mandou o arquivo errado) em vez de
      // empilhar duas linhas para a mesma semana na tela de conferência.
      const proofs = [
        ...(atual.proofs ?? []).filter((p) => p.weekId !== weekId),
        { weekId, url, dateUploaded: agora },
      ].sort((a, b) => a.weekId.localeCompare(b.weekId))

      await repo.updateDoc<PaymentDoc>('payments', id, { proofs, proofUrl: url, dateUpdated: agora })
      res.json({ id, proofs })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  // PUT /:id — atualiza proofUrl (usuário) ou verified (admin).
  // A regra estava só no comentário: qualquer um marcava a PRÓPRIA fatura como paga.
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string
      const atual = await repo.getDoc<PaymentDoc>('payments', id)
      if (!atual) { res.status(404).json({ message: 'Fatura não encontrada' }); return }
      const ator = await carregarAtor(repo, req.user!.uid)
      const corpo = req.body as Partial<PaymentDoc>
      let updates: Partial<PaymentDoc>
      if (ehAdminOuFornecedor(ator, atual.tenantId)) {
        updates = corpo
      } else if (atual.userId === ator.uid) {
        // O dono anexa comprovante — quem confere é outra pessoa.
        if (corpo.proofUrl === undefined) { negar(res, 'Só o comprovante pode ser alterado'); return }
        updates = { proofUrl: corpo.proofUrl }
      } else {
        negar(res); return
      }
      const comData = { ...updates, dateUpdated: new Date().toISOString() }
      await repo.updateDoc<PaymentDoc>('payments', id, comData)
      res.json({ id, ...comData })
    } catch (err) {
      res.status(500).json({ message: String(err) })
    }
  })

  return router
}
