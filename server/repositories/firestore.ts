import admin from 'firebase-admin'
import 'dotenv/config'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

export const db = admin.firestore()

export async function getDoc<T>(collection: string, id: string): Promise<(T & { id: string }) | null> {
  const snap = await db.collection(collection).doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as T) }
}

export async function listDocs<T>(
  collection: string,
  filters: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]> = []
): Promise<(T & { id: string })[]> {
  let query: FirebaseFirestore.Query = db.collection(collection)
  for (const [field, op, value] of filters) {
    query = query.where(field, op, value)
  }
  const snap = await query.get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))
}

export async function createDoc<T extends object>(
  collection: string,
  data: T
): Promise<T & { id: string }> {
  const ref = await db.collection(collection).add(data)
  return { id: ref.id, ...data }
}

export async function updateDoc<T extends object>(
  collection: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  await db.collection(collection).doc(id).update(data as FirebaseFirestore.UpdateData<T>)
}

export async function deleteDoc(collection: string, id: string): Promise<void> {
  await db.collection(collection).doc(id).delete()
}
