// Lógica da migração canônica da CSA (ARQUITETURA.md §4.5), isolada da infra para poder
// ser ensaiada em memória, no emulador e em produção com o MESMO código.
//
//   colmeias            → tenants (mesmos ids; a coleção antiga fica intacta)
//   colmeiaId           → tenantId (todas as coleções que carregam o campo)
//   deliveryType        'colmeia' → 'retirada'
//
// ADITIVA POR PADRÃO: o `tenantId` é escrito AO LADO do `colmeiaId`, que só some numa segunda
// passada explícita (`limparLegado`). É isso que mantém a janela reversível — enquanto o campo
// legado existir, o código antigo volta a rodar sem restaurar backup. A limpeza é feita depois,
// com o app novo já verde em produção.
//
// A exceção é `deliveryType`: é um valor, não um campo novo, então não dá para manter os dois.
// São 18 docs e o impacto no código antigo é cosmético (ele testa `=== 'colmeia'` só para
// exibir o rótulo; a regra de frete pergunta `isEntrega`, que continua certa).
//
// Fora de escopo por decisão: `acesso` continua string na produção — os predicados do core são
// dual-mode (task 3), então a leitura é retrocompatível e não há por que mexer nos dados.
//
// A migração é IDEMPOTENTE: rodar de novo não altera nada.

export interface DocRaw {
  id: string
  data: Record<string, unknown>
}

/** Porta mínima de escrita/leitura. Adapters: Firestore (prod/emulador) e memória (ensaio). */
export interface Store {
  listar(colecao: string): Promise<DocRaw[]>
  criar(colecao: string, id: string, data: Record<string, unknown>): Promise<void>
  /** `remover` são campos a apagar do doc (FieldValue.delete no Firestore). */
  atualizar(
    colecao: string,
    id: string,
    patch: Record<string, unknown>,
    remover: string[]
  ): Promise<void>
}

export const COLECOES_COM_TENANT = [
  'orders',
  'payments',
  'producers',
  'products',
  'roles',
  'users',
  'week_locks',
  'weekly_offerings',
] as const

export interface Opcoes {
  /** false (padrão) = dry-run: apura tudo e não escreve nada. */
  executar?: boolean
  /** 2ª passada: apaga o `colmeiaId`, encerrando a possibilidade de rollback sem backup. */
  limparLegado?: boolean
}

export interface Relatorio {
  tenantsCriados: string[]
  tenantsJaExistentes: string[]
  campos: Record<
    string,
    { migrados: number; jaCanonicos: number; semCampo: number; legadoRemovido: number }
  >
  deliveryTypeConvertidos: number
  /** Docs que seguem com `colmeiaId` ao lado do `tenantId` (o que permite o rollback). */
  legadoMantido: number
  /** Problemas que abortam a migração antes de qualquer escrita. */
  erros: string[]
  /** Situações que não impedem a migração, mas o operador precisa ver. */
  avisos: string[]
  executado: boolean
  limpouLegado: boolean
}

export async function migrarCanonico(store: Store, opcoes: Opcoes = {}): Promise<Relatorio> {
  const { executar = false, limparLegado = false } = opcoes
  const rel: Relatorio = {
    tenantsCriados: [],
    tenantsJaExistentes: [],
    campos: {},
    deliveryTypeConvertidos: 0,
    legadoMantido: 0,
    erros: [],
    avisos: [],
    executado: executar,
    limpouLegado: executar && limparLegado,
  }

  const colmeias = await store.listar('colmeias')
  const tenants = await store.listar('tenants')
  const idsTenant = new Set(tenants.map((t) => t.id))
  const idsValidos = new Set([...colmeias.map((c) => c.id), ...idsTenant])

  // --- 1. Verificações que precedem qualquer escrita ---
  if (colmeias.length === 0 && tenants.length === 0) {
    rel.erros.push('nenhum doc em `colmeias` nem em `tenants` — banco errado?')
  }

  const planoCampos: Array<{ colecao: string; doc: DocRaw; tenantId?: string; remover: string[] }> = []
  const planoDelivery: DocRaw[] = []

  for (const colecao of COLECOES_COM_TENANT) {
    const docs = await store.listar(colecao)
    const contagem = { migrados: 0, jaCanonicos: 0, semCampo: 0, legadoRemovido: 0 }

    for (const doc of docs) {
      const legado = doc.data['colmeiaId']
      const canonico = doc.data['tenantId']
      const remover = limparLegado && legado !== undefined ? ['colmeiaId'] : []

      if (legado !== undefined && canonico !== undefined) {
        if (legado !== canonico) {
          rel.erros.push(
            `${colecao}/${doc.id}: colmeiaId (${String(legado)}) e tenantId (${String(canonico)}) divergem`
          )
          continue
        }
        // Já tem os dois: só resta limpar o legado, se for a 2ª passada.
        contagem.jaCanonicos++
        if (limparLegado) {
          contagem.legadoRemovido++
          planoCampos.push({ colecao, doc, remover })
        } else {
          rel.legadoMantido++
        }
      } else if (legado !== undefined) {
        if (typeof legado !== 'string' || legado === '') {
          rel.erros.push(`${colecao}/${doc.id}: colmeiaId não é string não-vazia`)
          continue
        }
        if (!idsValidos.has(legado)) {
          rel.avisos.push(`${colecao}/${doc.id}: colmeiaId ${legado} não existe em colmeias/tenants (órfão)`)
        }
        contagem.migrados++
        if (limparLegado) contagem.legadoRemovido++
        else rel.legadoMantido++
        planoCampos.push({ colecao, doc, tenantId: legado, remover })
      } else if (canonico !== undefined) {
        contagem.jaCanonicos++
      } else {
        contagem.semCampo++
      }

      if (colecao === 'users') {
        const dt = doc.data['deliveryType']
        if (dt === 'colmeia') planoDelivery.push(doc)
        else if (dt !== undefined && dt !== 'entrega' && dt !== 'retirada') {
          rel.avisos.push(`users/${doc.id}: deliveryType inesperado (${JSON.stringify(dt)}) — não tocado`)
        }
      }
    }

    rel.campos[colecao] = contagem
  }

  rel.deliveryTypeConvertidos = planoDelivery.length

  for (const c of colmeias) {
    if (idsTenant.has(c.id)) rel.tenantsJaExistentes.push(c.id)
    else rel.tenantsCriados.push(c.id)
  }

  if (rel.erros.length > 0) return { ...rel, executado: false, limpouLegado: false }
  if (!executar) return rel

  // --- 2. Escritas. Tenants primeiro: nada aponta para um tenant que não existe. ---
  for (const c of colmeias) {
    if (idsTenant.has(c.id)) continue
    await store.criar('tenants', c.id, c.data)
  }
  for (const { colecao, doc, tenantId, remover } of planoCampos) {
    const patch = tenantId !== undefined ? { tenantId } : {}
    if (tenantId === undefined && remover.length === 0) continue
    await store.atualizar(colecao, doc.id, patch, remover)
  }
  for (const doc of planoDelivery) {
    await store.atualizar('users', doc.id, { deliveryType: 'retirada' }, [])
  }

  return rel
}

export function formatarRelatorio(rel: Relatorio): string {
  const l: string[] = []
  l.push(rel.executado ? '=== MIGRAÇÃO EXECUTADA ===' : '=== DRY-RUN (nada foi escrito) ===')
  if (rel.limpouLegado) l.push('modo: LIMPEZA DO LEGADO (colmeiaId apagado — sem rollback sem backup)')
  l.push(
    `tenants: ${rel.tenantsCriados.length} a criar${
      rel.tenantsJaExistentes.length ? `, ${rel.tenantsJaExistentes.length} já existiam` : ''
    }`
  )
  for (const [col, c] of Object.entries(rel.campos)) {
    l.push(
      `${col.padEnd(18)} tenantId escrito: ${String(c.migrados).padStart(4)}` +
        `   já canônicos: ${c.jaCanonicos}   sem o campo: ${c.semCampo}` +
        (c.legadoRemovido ? `   legado removido: ${c.legadoRemovido}` : '')
    )
  }
  l.push(`deliveryType 'colmeia'→'retirada': ${rel.deliveryTypeConvertidos}`)
  if (rel.legadoMantido) {
    l.push(`colmeiaId MANTIDO em ${rel.legadoMantido} docs — o código antigo ainda roda (rollback ok).`)
    l.push('Depois que o app novo estiver verde: rode de novo com --limpar-legado.')
  }
  if (rel.avisos.length) l.push('\nAVISOS:', ...rel.avisos.map((a) => `  ⚠ ${a}`))
  if (rel.erros.length) l.push('\nERROS (migração abortada):', ...rel.erros.map((e) => `  ✖ ${e}`))
  return l.join('\n')
}
