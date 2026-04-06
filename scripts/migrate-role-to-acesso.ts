// Migra campo `role` (nível de acesso) → `acesso` nos documentos da coleção `users`
// Uso:
//   FIREBASE_ENV=dev npx tsx scripts/migrate-role-to-acesso.ts
//   FIREBASE_ENV=prod npx tsx scripts/migrate-role-to-acesso.ts

import dotenv from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const env = process.env.FIREBASE_ENV === 'prod' ? '.env.production' : '.env.development'
dotenv.config({ path: resolve(__dirname, `../${env}`) })

import admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
})

const db = admin.firestore()

const ACCESS_VALUES = ['admin', 'user', 'superadmin', 'produtor']

const snap = await db.collection('users').get()
let migrated = 0
let skipped = 0

for (const doc of snap.docs) {
  const data = doc.data() as Record<string, unknown>
  const roleValue = data['role']

  if (!roleValue || !ACCESS_VALUES.includes(roleValue as string)) {
    skipped++
    continue
  }

  await db.collection('users').doc(doc.id).update({
    acesso: roleValue,
    role: admin.firestore.FieldValue.delete(),
  })
  console.log(`Migrado ${doc.id} (${data['name'] ?? '?'}): role=${roleValue} → acesso=${roleValue}`)
  migrated++
}

console.log(`\nConcluído. ${migrated} migrados, ${skipped} ignorados (total: ${snap.size})`)
