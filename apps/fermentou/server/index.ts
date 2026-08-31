import './env.js'
import express from 'express'
import cors from 'cors'
import {
  createTenantMiddleware, createTenantsRouter, createRolesRouter,
  createProducersRouter, createProductsRouter, createIssuesRouter, createUsersRouter,
  createPaymentsRouter, createOrdersRouter, createWhatsappAuthRouter, createOfferingsRouter,
} from '@pedidos/core/server'
import { config } from '../src/config.js'
import { firebaseAuth, whatsapp } from './adapters.js'
import { authMiddleware } from './middleware/auth.js'
import { paymentService } from './services/payments.js'
import { ordersService } from './services/orders.js'
import { db, repo } from './repositories/firestore.js'
import { startQuotaJob } from './jobs/quotaJob.js'
import { startSendOrdersJob } from './jobs/sendOrdersJob.js'
// req.user/req.tenantId vêm da augmentation de @pedidos/core/server (importado acima).

const app = express()
const PORT = process.env.PORT ?? 3004
// 127.0.0.1: backend nunca exposto direto — só via nginx (prod) ou localhost (dev)
const HOST = process.env.HOST || '127.0.0.1'

app.use(cors())
app.use(express.json())

// One-time setup endpoint (no auth) — cria a primeira organização (tenant) e o doc
// do admin. Bloqueado assim que já existir qualquer tenant (roda uma vez só).
// POST /api/setup  { adminUid, tenantName, adminName?, adminEmail? }
app.post('/api/setup', async (req, res) => {
  try {
    const existing = await db.collection('tenants').limit(1).get()
    if (!existing.empty) {
      res.status(400).json({ message: 'Setup já executado: já existe uma organização' })
      return
    }
    const { adminUid, tenantName, adminName, adminEmail } = req.body as {
      adminUid?: string; tenantName?: string; adminName?: string; adminEmail?: string
    }
    if (!adminUid || !tenantName?.trim()) {
      res.status(400).json({ message: 'adminUid e tenantName obrigatórios' })
      return
    }
    const now = new Date().toISOString()
    const tenantRef = await db.collection('tenants').add({
      name: tenantName.trim(),
      adminId: adminUid,
      dateCreated: now,
    })
    // Doc do admin em `users` — sem ele, GET /users/me dá 404 e o login não carrega.
    // superadmin: acessa a administração e todas as organizações.
    await db.collection('users').doc(adminUid).set({
      name: adminName?.trim() || 'Admin',
      email: adminEmail?.trim().toLowerCase() || '',
      address: '',
      contact: '',
      frequency: 'semanal',
      deliveryType: 'retirada',
      tenantId: tenantRef.id,
      acesso: ['superadmin', 'admin'], // quem roda o setup é o admin/dev; o fornecedor (dono da loja) é criado depois
      isentoCotas: true,
    })
    // Fornecedor padrão = a própria loja. Enquanto for o único, a UI de seleção de
    // fornecedor fica colapsada (produtos entram nele direto). Ver frontend.
    await db.collection('producers').add({
      name: tenantName.trim(),
      contact: '',
      tenantId: tenantRef.id,
    })
    res.status(201).json({ id: tenantRef.id, name: tenantName.trim() })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// Rotas públicas (sem auth)
app.use('/api/auth/whatsapp', createWhatsappAuthRouter({ repo, auth: firebaseAuth, whatsapp }, config))

app.use('/api', authMiddleware)
app.use('/api', createTenantMiddleware({ repo }))

// Integração GitHub (report de bug): lida do .env aqui no boot — o engine não lê env.
const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env
const github = GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN
  ? { owner: GITHUB_OWNER, repo: GITHUB_REPO, token: GITHUB_TOKEN }
  : undefined

app.use('/api/tenants', createTenantsRouter({ repo }, config))
app.use('/api/products', createProductsRouter({ repo }))
app.use('/api/producers', createProducersRouter({ repo }))
app.use('/api/offerings', createOfferingsRouter({ repo }, config))
app.use('/api/orders', createOrdersRouter({ repo, payments: paymentService, orders: ordersService, whatsapp }, config))
app.use('/api/payments', createPaymentsRouter({ repo, payments: paymentService }))
app.use('/api/users', createUsersRouter({ repo, auth: firebaseAuth, whatsapp, appUrl: process.env.APP_URL }, config))
app.use('/api/issues', createIssuesRouter(github))
app.use('/api/roles', createRolesRouter({ repo }, config))

app.listen(Number(PORT), HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`)
  startQuotaJob()
  startSendOrdersJob()
})
