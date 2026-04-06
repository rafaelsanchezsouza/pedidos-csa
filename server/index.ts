import './env.js'
import express from 'express'
import cors from 'cors'
import { authMiddleware } from './middleware/auth.js'
import { colmeiaMiddleware } from './middleware/colmeia.js'
import colmeiasRouter from './routes/colmeias.js'
import productsRouter from './routes/products.js'
import producersRouter from './routes/producers.js'
import offeringsRouter from './routes/offerings.js'
import ordersRouter from './routes/orders.js'
import paymentsRouter from './routes/payments.js'
import usersRouter from './routes/users.js'
import issuesRouter from './routes/issues.js'
import rolesRouter from './routes/roles.js'
import { db } from './repositories/firestore.js'

declare module 'express' {
  interface Request {
    user?: { uid: string; email: string }
    colmeiaId?: string
  }
}

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json())

// One-time setup endpoint (no auth) — creates "Flor de Quilombo" colmeia
// POST /api/setup  { adminEmail: string, adminUid: string }
app.post('/api/setup', async (req, res) => {
  try {
    const existing = await db.collection('colmeias').where('name', '==', 'Flor de Quilombo').get()
    if (!existing.empty) {
      res.status(400).json({ message: 'Colmeia já existe' })
      return
    }
    const { adminUid } = req.body as { adminUid: string }
    const ref = await db.collection('colmeias').add({
      name: 'Flor de Quilombo',
      adminId: adminUid,
      dateCreated: new Date().toISOString(),
    })
    res.status(201).json({ id: ref.id, name: 'Flor de Quilombo' })
  } catch (err) {
    res.status(500).json({ message: String(err) })
  }
})

app.use('/api', authMiddleware)
app.use('/api', colmeiaMiddleware)

app.use('/api/colmeias', colmeiasRouter)
app.use('/api/products', productsRouter)
app.use('/api/producers', producersRouter)
app.use('/api/offerings', offeringsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/users', usersRouter)
app.use('/api/issues', issuesRouter)
app.use('/api/roles', rolesRouter)

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})
