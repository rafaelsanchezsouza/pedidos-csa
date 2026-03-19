import dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.development') })

import admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})

const db = admin.firestore()

// Dados do CSV: [nome, preço, unidade]
const produtos: [string, number, string][] = [
  ['Ovo caipira',         1.20, 'unid'],
  ['Ovos capoeira',       1.40, 'unid'],
  ['Alface',              4.00, 'unid'],
  ['Acelga',              4.00, 'unid'],
  ['Abacate',             8.00, 'unid'],
  ['Coentro',             5.00, 'unid'],
  ['Couve',               3.00, 'unid'],
  ['Brócolis',            6.00, 'unid'],
  ['Rúcula',              3.00, 'unid'],
  ['Cebolinha',           3.00, 'unid'],
  ['Salsinha',            3.00, 'unid'],
  ['Capim Santo',         3.00, 'unid'],
  ['Hortelã',             3.00, 'unid'],
  ['Espinafre',           3.00, 'unid'],
  ['Macaxeira',           5.00, 'kg'],
  ['Batata doce',         6.00, 'kg'],
  ['Cenoura',             4.00, 'unid'],
  ['Beterraba',           4.00, 'unid'],
  ['Chuchu',              2.00, 'unid'],
  ['Pepino japonês',      3.00, 'unid'],
  ['Milho verde',         1.00, 'unid'],
  ['Jerimum',             6.00, 'kg'],
  ['Quiabo',              3.00, 'unid'],
  ['Pimentão',            2.00, 'unid'],
  ['Alho Poró',           3.00, 'porção'],
  ['Abacaxi',             3.60, 'unid'],
  ['Banana',              5.00, 'palma'],
  ['Limão',               0.70, 'unid'],
  ['Laranja comum',       0.80, 'unid'],
  ['Laranja Mimo do Céu', 1.00, 'unid'],
  ['Laranja Tangerina',   1.00, 'unid'],
  ['Laranja Poncan',      1.00, 'unid'],
  ['Laranja Baia',        1.00, 'unid'],
  ['Seriguela',           3.00, 'unid'],
  ['Manga',               3.00, 'unid'],
  ['Manga Promo',         5.00, '2 unidades'],
  ['Manga espada',        5.00, 'unid'],
  ['Coco verde',          3.00, 'unid'],
  ['Jaboticaba',          6.00, 'kg'],
  ['Carambola',           4.00, 'unid'],
  ['Maracujá',            6.00, 'unid'],
  ['Abobrinha',           3.00, 'unid'],
  ['Goma',                8.00, 'kg'],
  ['Mamão',               4.00, 'kg'],
]

async function main() {
  // Buscar colmeia
  const colmeiasSnap = await db.collection('colmeias').limit(1).get()
  if (colmeiasSnap.empty) throw new Error('Nenhuma colmeia encontrada')
  const colmeia = colmeiasSnap.docs[0]
  console.log(`Colmeia: ${colmeia.data().name} (${colmeia.id})`)

  // Buscar produtor Jucy Edilson
  const produtorSnap = await db.collection('producers')
    .where('colmeiaId', '==', colmeia.id)
    .get()

  const jucy = produtorSnap.docs.find((d) =>
    (d.data().name as string).toLowerCase().includes('jucy') ||
    (d.data().name as string).toLowerCase().includes('edilson')
  )

  if (!jucy) {
    console.error('Produtor Jucy Edilson não encontrado. Produtores disponíveis:')
    produtorSnap.docs.forEach((d) => console.log(' -', d.data().name))
    process.exit(1)
  }
  console.log(`Produtor: ${jucy.data().name} (${jucy.id})`)

  // Verificar produtos já existentes
  const existentesSnap = await db.collection('products')
    .where('colmeiaId', '==', colmeia.id)
    .where('producerId', '==', jucy.id)
    .get()

  const existentes = new Set(existentesSnap.docs.map((d) => (d.data().name as string).toLowerCase()))
  console.log(`Produtos já existentes: ${existentes.size}`)

  // Inserir produtos novos
  const batch = db.batch()
  let count = 0
  const dateUpdated = new Date().toISOString()

  for (const [name, price, unit] of produtos) {
    if (existentes.has(name.toLowerCase())) {
      console.log(`  skip (já existe): ${name}`)
      continue
    }
    const ref = db.collection('products').doc()
    batch.set(ref, { name, price, unit, producerId: jucy.id, colmeiaId: colmeia.id, dateUpdated })
    console.log(`  + ${name} — R$${price.toFixed(2)} / ${unit}`)
    count++
  }

  if (count === 0) {
    console.log('Nenhum produto novo para inserir.')
    process.exit(0)
  }

  await batch.commit()
  console.log(`\n✓ ${count} produtos inseridos.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
