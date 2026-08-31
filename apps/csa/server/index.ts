import './env.js'
import express from 'express'
import cors from 'cors'
import {
  createTenantMiddleware, createTenantsRouter, createRolesRouter,
  createProducersRouter, createProductsRouter, createIssuesRouter, createUsersRouter,
  createPaymentsRouter, createOrdersRouter, createWhatsappAuthRouter, createOfferingsRouter,
  createWhatsappWebhookRouter, createAcolhidaRouter,
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
const PORT = process.env.PORT ?? 3001
// 127.0.0.1: backend nunca exposto direto — só via nginx (prod) ou localhost (dev)
const HOST = process.env.HOST || '127.0.0.1'

app.use(cors())
app.use(express.json())

// One-time setup endpoint (no auth) — cria a primeira colmeia (tenant) e o doc do admin.
// Bloqueado assim que já existir qualquer tenant (roda uma vez só). A produção da CSA já passou
// por aqui; fica para montar um ambiente novo do zero (dev/staging).
// Sem fornecedor padrão de propósito: na CSA os fornecedores são os produtores e a oferta nasce
// da mensagem deles (`offeringSource: 'parse-message'`).
// POST /api/setup  { adminUid, tenantName, adminName?, adminEmail? }
app.post('/api/setup', async (req, res) => {
  try {
    const existing = await db.collection('tenants').limit(1).get()
    if (!existing.empty) {
      res.status(400).json({ message: 'Setup já executado: já existe uma colmeia' })
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
    await db.collection('users').doc(adminUid).set({
      name: adminName?.trim() || 'Admin',
      email: adminEmail?.trim().toLowerCase() || '',
      address: '',
      contact: '',
      frequency: 'semanal',
      deliveryType: 'retirada',
      tenantId: tenantRef.id,
      acesso: ['superadmin', 'admin'],
      isentoCotas: true,
    })
    res.status(201).json({ id: tenantRef.id, name: tenantName.trim() })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

// Rotas públicas (sem auth)
app.use('/api/auth/whatsapp', createWhatsappAuthRouter({ repo, auth: firebaseAuth, whatsapp }, config))

// Integração GitHub (report de bug): lida do .env aqui no boot — o engine não lê env.
const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env
const github = GITHUB_OWNER && GITHUB_REPO && GITHUB_TOKEN
  ? { owner: GITHUB_OWNER, repo: GITHUB_REPO, token: GITHUB_TOKEN }
  : undefined

// Webhook do WhatsApp (protocolo zap-in/1): grupo vira issue no GitHub.
// Quem entrega é o **zap-hub**, não a evolution direto — a evolution aceita um webhook por
// instância e o note-app já ocupava o slot. O hub roda no host e alcança este backend em
// 127.0.0.1; a evolution, que é container, nunca alcançaria (o app só escuta em loopback).
// Montado no caminho da spec e ANTES do authMiddleware: quem chama se autentica por
// `x-zap-secret`, não por token do Firebase.
const { WHATSAPP_ISSUES_GROUP_JID, WHATSAPP_ISSUES_PREFIX, ZAP_WEBHOOK_SECRET } = process.env
if (WHATSAPP_ISSUES_GROUP_JID) {
  app.use('/api/whatsapp/webhook', createWhatsappWebhookRouter(
    { github, whatsapp },
    {
      groupJid: WHATSAPP_ISSUES_GROUP_JID,
      prefixo: WHATSAPP_ISSUES_PREFIX ?? '/issue',
      secret: ZAP_WEBHOOK_SECRET,
    },
  ))
}

app.use('/api', authMiddleware)
app.use('/api', createTenantMiddleware({ repo }))

app.use('/api/tenants', createTenantsRouter({ repo }, config))
app.use('/api/products', createProductsRouter({ repo }))
app.use('/api/producers', createProducersRouter({ repo }))
// parseMessage não é injetado: config.capabilities.messageParser = 'fuzzy' e o fuzzy vem do core.
// Para voltar ao OpenAI: messageParser: 'openai' na config + `parseMessage` do adapter local.
app.use('/api/offerings', createOfferingsRouter({ repo }, config))
app.use('/api/orders', createOrdersRouter({ repo, payments: paymentService, orders: ordersService, whatsapp }, config))
app.use('/api/payments', createPaymentsRouter({ repo, payments: paymentService }))
app.use('/api/users', createUsersRouter(
  { repo, auth: firebaseAuth, whatsapp, appUrl: process.env.APP_URL ?? 'https://csaparahyba.com.br' },
  config,
))
// Confirmação semanal de quem está em acolhida (paga a semana, não o mês).
app.use('/api/acolhida', createAcolhidaRouter({ repo, payments: paymentService }, config))
app.use('/api/issues', createIssuesRouter(github))
app.use('/api/roles', createRolesRouter({ repo }, config))

app.listen(Number(PORT), HOST, () => {
  console.log(`Servidor rodando em http://${HOST}:${PORT}`)
  startQuotaJob()
  startSendOrdersJob()
})
