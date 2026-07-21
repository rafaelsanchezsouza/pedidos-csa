import './env.js'
import express from 'express'
import cors from 'cors'
import { authMiddleware } from './middleware/auth.js'
import { tenantMiddleware } from './middleware/tenant.js'
import tenantsRouter from './routes/tenants.js'
import productsRouter from './routes/products.js'
import producersRouter from './routes/producers.js'
import offeringsRouter from './routes/offerings.js'
import ordersRouter from './routes/orders.js'
import paymentsRouter from './routes/payments.js'
import usersRouter from './routes/users.js'
import issuesRouter from './routes/issues.js'
import rolesRouter from './routes/roles.js'
import whatsappAuthRouter from './routes/whatsappAuth.js'
import { db } from './repositories/firestore.js'
import { startQuotaJob } from './jobs/quotaJob.js'
import { startSendOrdersJob } from './jobs/sendOrdersJob.js'

declare module 'express' {
  interface Request {
    user?: { uid: string; email: string }
    tenantId?: string
  }
}

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
      acesso: ['superadmin', 'admin', 'fornecedor'],
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
app.use('/api/auth/whatsapp', whatsappAuthRouter)

app.use('/api', authMiddleware)
app.use('/api', tenantMiddleware)

app.use('/api/tenants', tenantsRouter)
app.use('/api/products', productsRouter)
app.use('/api/producers', producersRouter)
app.use('/api/offerings', offeringsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/users', usersRouter)
app.use('/api/issues', issuesRouter)
app.use('/api/roles', rolesRouter)

app.listen(Number(PORT), HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`)
  startQuotaJob()
  startSendOrdersJob()
})
