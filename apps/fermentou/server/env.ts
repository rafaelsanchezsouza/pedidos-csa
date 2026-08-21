import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// O arquivo de env mora na RAIZ do app, mas a distância daqui até ela MUDA: em dev este arquivo
// é `server/env.ts` (1 nível); compilado, é `dist-server/server/env.js` (2). Um '..' fixo só
// acerta um dos dois — e o custo do erro é o pior possível: dotenv não reclama de path
// inexistente, o boot segue sem variável nenhuma e só estoura depois, no firebase-admin, com
// "Service account object must contain a string project_id" (foi o que derrubou o 1º deploy).
// Por isso: procurar subindo, e falhar AQUI, dizendo o que faltou.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development'
const aqui = dirname(fileURLToPath(import.meta.url))

let caminho: string | undefined
let dir = aqui
for (let i = 0; i <= 3 && !caminho; i++) {
  const tentativa = resolve(dir, envFile)
  if (existsSync(tentativa)) caminho = tentativa
  dir = dirname(dir)
}

if (!caminho) {
  throw new Error(
    `env: ${envFile} não encontrado a partir de ${aqui} (procurei 3 níveis acima). ` +
      `Em produção ele é copiado para a raiz do app pelo deploy.sh; em dev, crie-o na raiz do app.`
  )
}

dotenv.config({ path: caminho })
