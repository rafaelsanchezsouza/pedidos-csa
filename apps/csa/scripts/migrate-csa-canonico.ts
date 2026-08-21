// Migração canônica da CSA — ARQUITETURA.md §4.5. RODAR UMA VEZ, em janela de manutenção.
// A lógica está em migracao-canonico.ts (testada); aqui só entram os adapters e as travas.
//
// Ensaio em memória sobre o dump de produção (não toca em banco nenhum):
//   npx tsx scripts/migrate-csa-canonico.ts --dump=/caminho/dump.json
//   npx tsx scripts/migrate-csa-canonico.ts --dump=/caminho/dump.json --executar   # grava .migrado.json
//
// Ensaio no emulador (dados importados do dump):
//   FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/migrate-csa-canonico.ts --executar
//
// Produção (dry-run primeiro, SEMPRE):
//   FIREBASE_ENV=prod npx tsx scripts/migrate-csa-canonico.ts
//   FIREBASE_ENV=prod npx tsx scripts/migrate-csa-canonico.ts --executar
//
// 2ª passada, DEPOIS que o app novo estiver verde em produção (apaga o colmeiaId e com ele a
// possibilidade de rollback sem restaurar backup):
//   FIREBASE_ENV=prod npx tsx scripts/migrate-csa-canonico.ts --executar --limpar-legado
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { migrarCanonico, formatarRelatorio, type DocRaw, type Store } from './migracao-canonico.js'
import { memoryStore, type Dump } from './memoryStore.js'

const executar = process.argv.includes('--executar')
const limparLegado = process.argv.includes('--limpar-legado')
const arqDump = process.argv.find((a) => a.startsWith('--dump='))?.slice('--dump='.length)

async function storeDeDump(caminho: string): Promise<{ store: Store; fim: () => void }> {
  const dump = JSON.parse(readFileSync(caminho, 'utf8')) as Dump
  const store = memoryStore(dump)
  console.log(`ALVO: ensaio em memória sobre ${caminho} (nenhum banco é tocado)\n`)
  return {
    store,
    fim: () => {
      if (!executar) return
      const saida = caminho.replace(/\.json$/, '') + '.migrado.json'
      writeFileSync(saida, JSON.stringify(store.dump(), null, 2))
      console.log(`\nResultado do ensaio: ${saida}`)
    },
  }
}

async function storeFirestore(): Promise<{ store: Store; fim: () => void }> {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const emulador = process.env.FIRESTORE_EMULATOR_HOST
  const arqEnv = process.env.FIREBASE_ENV === 'prod' ? '.env.production' : '.env.development'
  dotenv.config({ path: resolve(__dirname, `../${arqEnv}`) })

  const { default: admin } = await import('firebase-admin')
  admin.initializeApp(
    emulador
      ? { projectId: process.env.FIREBASE_PROJECT_ID ?? 'pedidos-csa' }
      : {
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        }
  )
  const db = admin.firestore()
  const alvo = emulador ? `EMULADOR ${emulador}` : `FIRESTORE REAL — projeto ${process.env.FIREBASE_PROJECT_ID}`
  console.log(`ALVO: ${alvo}\n`)

  const store: Store = {
    async listar(colecao): Promise<DocRaw[]> {
      const snap = await db.collection(colecao).get()
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }))
    },
    async criar(colecao, id, data) {
      await db.collection(colecao).doc(id).set(data)
    },
    async atualizar(colecao, id, patch, remover) {
      const dados: Record<string, unknown> = { ...patch }
      for (const campo of remover) dados[campo] = admin.firestore.FieldValue.delete()
      await db.collection(colecao).doc(id).update(dados)
    },
  }
  return { store, fim: () => {} }
}

const { store, fim } = arqDump ? await storeDeDump(arqDump) : await storeFirestore()

const rel = await migrarCanonico(store, { executar, limparLegado })
console.log(formatarRelatorio(rel))
fim()

if (rel.erros.length > 0) process.exit(1)
if (!executar) console.log('\n(dry-run — repita com --executar para gravar)')
