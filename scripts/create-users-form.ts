import dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.production') })

import admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})

const db = admin.firestore()

// Derivar ciclo quinzenal a partir da data da última entrega (DD/MM/YYYY)
function quinzenalParity(lastDelivery: string): 'par' | 'impar' {
  const [d, m, y] = lastDelivery.split('/').map(Number)
  const date = new Date(y, m - 1, d)
  // getWeekStart (segunda-feira da semana)
  const day = date.getDay()
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1))
  const weekStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  // getISOWeekNumber
  const d2 = new Date(weekStart)
  const utc = new Date(Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate()))
  const dayNum = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return weekNum % 2 === 0 ? 'par' : 'impar'
}

function tempPassword(): string {
  return Math.random().toString(36).slice(2, 8) + 'Csa1!'
}

const colmeiasSnap = await db.collection('colmeias').get()
if (colmeiasSnap.empty) { console.error('Nenhuma colmeia encontrada'); process.exit(1) }
const colmeiaId = colmeiasSnap.docs[0].id
console.log(`Colmeia: ${colmeiasSnap.docs[0].data().name} (${colmeiaId})\n`)

// Dados do formulário de pré-cadastro
const users = [
  {
    name: 'Wilma Limeira de Castro',
    email: 'Wilmalimeira28@gmail.com',
    contact: '83988078165',
    address: 'Rua Edvaldo Bezerra Cavalcanti Pinho, 1029, 203, Cabo Branco, 58045-270',
    deliveryType: 'entrega',
    frequency: 'quinzenal',
    role: 'user',
    lastDelivery: '25/03/2026',
  },
  {
    name: 'Danilo Di Giorgi',
    email: 'digiorgi@gmail.com',
    contact: '84981873710',
    address: 'Rua Ana Cristina Rolim Machado, 246, ap 101, Aeroclube, 54036-444',
    deliveryType: 'colmeia',
    frequency: 'semanal',
    role: 'admin',
    lastDelivery: null,
  },
  {
    name: 'Patrícia Ferreira Rodrigues',
    email: 'paty_zz@yahoo.com.br',
    contact: '83988049659',
    address: 'Rua São Gonçalo, 923, ap. 102, Residencial JF Falcão, Manaíra, 58038-331',
    deliveryType: 'entrega',
    frequency: 'semanal',
    role: 'admin',
    lastDelivery: null,
  },
  {
    name: 'Pietra Trigueiro',
    email: 'Pietratrigueiro@gmail.com',
    contact: '83991551414',
    address: 'Rua Izabel Amélia de Oliveira, 310, Ap 203, Intermares, 58102-316',
    deliveryType: 'entrega',
    frequency: 'quinzenal',
    role: 'user',
    lastDelivery: '25/03/2026',
  },
  {
    name: 'Rosa Cristina de Carvalho',
    email: 'rosacristinacarvalho1@gmail.com',
    contact: '83986608123',
    address: 'Rua Norberto de Castro Nogueira, 505, Apto 401, Jardim Oceania, 58037-603',
    deliveryType: 'entrega',
    frequency: 'semanal',
    role: 'user',
    lastDelivery: null,
  },
  {
    name: 'Fernanda Teixeira',
    email: 'teixeirafcp@yahoo.com.br',
    contact: '5583999409766',
    address: 'Rua Padre José Trigueiro, 78, 403, Cabo Branco, 58045-400',
    deliveryType: 'colmeia',
    frequency: 'quinzenal',
    role: 'user',
    lastDelivery: '25/03/2026',
  },
]

console.log('Criando usuários...\n')
for (const u of users) {
  const password = tempPassword()
  try {
    const authUser = await admin.auth().createUser({ email: u.email, password })
    const doc: Record<string, unknown> = {
      name: u.name,
      email: u.email,
      contact: u.contact,
      address: u.address,
      deliveryType: u.deliveryType,
      frequency: u.frequency,
      role: u.role,
      colmeiaId,
      mustChangePassword: true,
      quota: 'Cota inteira',
    }
    if (u.frequency === 'quinzenal' && u.lastDelivery) {
      doc.quinzenalParity = quinzenalParity(u.lastDelivery)
    }
    await db.collection('users').doc(authUser.uid).set(doc)
    const parityInfo = doc.quinzenalParity ? ` [ciclo: ${doc.quinzenalParity}]` : ''
    console.log(`✓ ${u.name} <${u.email}> [${u.role}]${parityInfo}`)
    console.log(`  senha temporária: ${password}\n`)
  } catch (err) {
    console.error(`✗ ${u.name}: ${err}\n`)
  }
}

console.log('Pronto.')
