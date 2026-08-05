import type { Repo, WhereFilter, WithId } from './repo.js'

// Adapter de memória da porta Repo — para testes do engine (e dos apps) sem Firestore.
// Semeia com { colecao: { id: doc } }.
export function createMemoryRepo(seed: Record<string, Record<string, object>> = {}): Repo {
  const data = new Map<string, Map<string, object>>()
  for (const [name, docs] of Object.entries(seed)) data.set(name, new Map(Object.entries(docs)))
  let seq = 0
  const col = (name: string): Map<string, object> => {
    if (!data.has(name)) data.set(name, new Map())
    return data.get(name)!
  }
  const matches = (doc: Record<string, unknown>, [field, op, value]: WhereFilter): boolean => {
    const v = doc[field]
    switch (op) {
      case '==': return v === value
      case '!=': return v !== value
      case '<': return (v as never) < (value as never)
      case '<=': return (v as never) <= (value as never)
      case '>': return (v as never) > (value as never)
      case '>=': return (v as never) >= (value as never)
      case 'in': return Array.isArray(value) && value.includes(v)
      case 'array-contains': return Array.isArray(v) && v.includes(value)
    }
  }
  return {
    async getDoc<T>(c: string, id: string) {
      const d = col(c).get(id)
      return d ? ({ id, ...d } as WithId<T>) : null
    },
    async listDocs<T>(c: string, filters: WhereFilter[] = []) {
      return [...col(c).entries()]
        .filter(([, d]) => filters.every((f) => matches(d as Record<string, unknown>, f)))
        .map(([id, d]) => ({ id, ...d }) as WithId<T>)
    },
    async createDoc<T extends object>(c: string, d: T) {
      const id = `id${++seq}`
      col(c).set(id, { ...d })
      return { id, ...d }
    },
    async setDoc(c, id, d) {
      col(c).set(id, { ...d })
    },
    async updateDoc(c, id, d) {
      const cur = col(c).get(id)
      if (!cur) throw new Error(`updateDoc: ${c}/${id} não existe`)
      col(c).set(id, { ...cur, ...d })
    },
    async updateMany(c, updates) {
      for (const [id, d] of updates) {
        const cur = col(c).get(id)
        if (!cur) throw new Error(`updateMany: ${c}/${id} não existe`)
        col(c).set(id, { ...cur, ...d })
      }
    },
    async deleteDoc(c, id) {
      col(c).delete(id)
    },
  }
}
