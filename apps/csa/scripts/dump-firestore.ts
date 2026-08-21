// Backup SOMENTE LEITURA do Firestore para um JSON — é o backup exigido antes da migração
// canônica (ARQUITETURA.md decisão 4) e também a fonte do ensaio em memória/emulador.
//
//   FIREBASE_ENV=prod OUT=/caminho/dump.json npx tsx scripts/dump-firestore.ts
//
// ⚠️ O JSON contém dados pessoais de membros: guarde FORA do repo e apague depois.
import dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const arqEnv = process.env.FIREBASE_ENV === 'prod' ? '.env.production' : '.env.development'
dotenv.config({ path: resolve(__dirname, `../${arqEnv}`) })

import admin from 'firebase-admin'

const saida = process.env.OUT
if (!saida) throw new Error('defina OUT=/caminho/dump.json')

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})
const db = admin.firestore()

const dump: Record<string, Record<string, unknown>> = {}
for (const col of await db.listCollections()) {
  const snap = await col.get()
  dump[col.id] = {}
  for (const doc of snap.docs) dump[col.id][doc.id] = doc.data()
  const subs = new Set<string>()
  for (const doc of snap.docs) for (const s of await doc.ref.listCollections()) subs.add(s.id)
  if (subs.size) console.log(`  ⚠ subcoleções em ${col.id}: ${[...subs].join(', ')} (NÃO incluídas)`)
  console.log(`${col.id}: ${snap.size} docs`)
}

writeFileSync(saida, JSON.stringify(dump, null, 2))
console.log(`\nprojeto ${process.env.FIREBASE_PROJECT_ID} → ${saida}`)
