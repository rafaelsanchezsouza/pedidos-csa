import { describe, it, expect } from 'vitest'
import { migrarCanonico, COLECOES_COM_TENANT } from './migracao-canonico.js'
import { memoryStore, type Dump } from './memoryStore.js'

const T = 'Nc90RIqPK4M9ypMG9VTR'

function base(): Dump {
  return {
    colmeias: { [T]: { name: 'Flor de Quilombo', adminId: 'u1', dateCreated: '2024-01-01' } },
    users: {
      u1: { name: 'A', colmeiaId: T, deliveryType: 'colmeia', acesso: 'admin' },
      u2: { name: 'B', colmeiaId: T, deliveryType: 'entrega', acesso: 'user' },
    },
    orders: { o1: { userId: 'u1', colmeiaId: T, weekId: '2025-W01' } },
    payments: { p1: { userId: 'u1', colmeiaId: T, amount: 65 } },
    otp_codes: { x1: { uid: 'u1', code: '123456' } },
  }
}

describe('migrarCanonico', () => {
  it('dry-run apura tudo e não escreve nada', async () => {
    const store = memoryStore(base())
    const antes = store.dump()

    const rel = await migrarCanonico(store)

    expect(rel.executado).toBe(false)
    expect(rel.tenantsCriados).toEqual([T])
    expect(rel.campos.users.migrados).toBe(2)
    expect(rel.deliveryTypeConvertidos).toBe(1)
    expect(store.dump()).toEqual(antes)
  })

  it('cria tenants com o mesmo id e preserva colmeias para rollback', async () => {
    const store = memoryStore(base())
    await migrarCanonico(store, true)
    const d = store.dump()

    expect(d.tenants[T]).toEqual({ name: 'Flor de Quilombo', adminId: 'u1', dateCreated: '2024-01-01' })
    expect(d.colmeias[T]).toBeDefined()
  })

  it('renomeia colmeiaId→tenantId em todas as coleções e converte deliveryType', async () => {
    const store = memoryStore(base())
    await migrarCanonico(store, true)
    const d = store.dump()

    for (const col of ['users', 'orders', 'payments']) {
      for (const doc of Object.values(d[col])) {
        expect(doc.tenantId).toBe(T)
        expect(doc).not.toHaveProperty('colmeiaId')
      }
    }
    expect(d.users.u1.deliveryType).toBe('retirada')
    expect(d.users.u2.deliveryType).toBe('entrega')
  })

  it('não toca em coleções sem tenant (otp_codes)', async () => {
    const store = memoryStore(base())
    await migrarCanonico(store, true)
    expect(store.dump().otp_codes.x1).toEqual({ uid: 'u1', code: '123456' })
    expect(COLECOES_COM_TENANT).not.toContain('otp_codes')
  })

  it('preserva os demais campos do doc', async () => {
    const store = memoryStore(base())
    await migrarCanonico(store, true)
    expect(store.dump().users.u2).toEqual({
      name: 'B',
      tenantId: T,
      deliveryType: 'entrega',
      acesso: 'user',
    })
  })

  it('é idempotente: a 2ª passada não muda nada', async () => {
    const store = memoryStore(base())
    await migrarCanonico(store, true)
    const depois1 = store.dump()

    const rel = await migrarCanonico(store, true)

    expect(store.dump()).toEqual(depois1)
    expect(rel.tenantsCriados).toEqual([])
    expect(rel.tenantsJaExistentes).toEqual([T])
    expect(rel.campos.users.migrados).toBe(0)
    expect(rel.campos.users.jaCanonicos).toBe(2)
    expect(rel.deliveryTypeConvertidos).toBe(0)
  })

  it('limpa o campo legado quando os dois existem com o mesmo valor (passada interrompida)', async () => {
    const d = base()
    d.orders.o1.tenantId = T
    const store = memoryStore(d)

    await migrarCanonico(store, true)

    expect(store.dump().orders.o1).not.toHaveProperty('colmeiaId')
    expect(store.dump().orders.o1.tenantId).toBe(T)
  })

  it('aborta sem escrever nada se colmeiaId e tenantId divergem', async () => {
    const d = base()
    d.orders.o1.tenantId = 'outro'
    const store = memoryStore(d)
    const antes = store.dump()

    const rel = await migrarCanonico(store, true)

    expect(rel.executado).toBe(false)
    expect(rel.erros).toHaveLength(1)
    expect(rel.erros[0]).toContain('divergem')
    expect(store.dump()).toEqual(antes)
  })

  it('avisa sobre doc órfão mas migra', async () => {
    const d = base()
    d.orders.o2 = { userId: 'u9', colmeiaId: 'sumiu' }
    const store = memoryStore(d)

    const rel = await migrarCanonico(store, true)

    expect(rel.avisos.some((a) => a.includes('órfão'))).toBe(true)
    expect(store.dump().orders.o2.tenantId).toBe('sumiu')
  })

  it('avisa sobre deliveryType inesperado sem tocar no doc', async () => {
    const d = base()
    d.users.u3 = { name: 'C', colmeiaId: T, deliveryType: 'ponto' }
    const store = memoryStore(d)

    const rel = await migrarCanonico(store, true)

    expect(rel.avisos.some((a) => a.includes('deliveryType inesperado'))).toBe(true)
    expect(store.dump().users.u3.deliveryType).toBe('ponto')
  })

  it('aborta em banco vazio (proteção contra apontar para o projeto errado)', async () => {
    const rel = await migrarCanonico(memoryStore({}), true)
    expect(rel.executado).toBe(false)
    expect(rel.erros[0]).toContain('banco errado')
  })
})
