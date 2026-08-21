// Store de memória: usado nos testes e no ENSAIO contra uma cópia do dump de produção.
import type { DocRaw, Store } from './migracao-canonico.js'

export type Dump = Record<string, Record<string, Record<string, unknown>>>

export interface MemoryStore extends Store {
  dump(): Dump
}

export function memoryStore(inicial: Dump = {}): MemoryStore {
  const dados: Dump = structuredClone(inicial)

  return {
    async listar(colecao: string): Promise<DocRaw[]> {
      return Object.entries(dados[colecao] ?? {}).map(([id, data]) => ({
        id,
        data: structuredClone(data),
      }))
    },
    async criar(colecao, id, data) {
      dados[colecao] ??= {}
      dados[colecao][id] = structuredClone(data)
    },
    async atualizar(colecao, id, patch, remover) {
      const doc = dados[colecao]?.[id]
      if (!doc) throw new Error(`atualizar: ${colecao}/${id} não existe`)
      Object.assign(doc, structuredClone(patch))
      for (const campo of remover) delete doc[campo]
    },
    dump: () => structuredClone(dados),
  }
}
