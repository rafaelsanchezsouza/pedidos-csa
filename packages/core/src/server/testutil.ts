import express, { type Router } from 'express'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import './types.js'

// Harness de teste (excluído do build): sobe um app express DE VERDADE numa porta efêmera,
// com auth fake (req.user = uid) e o router montado; devolve um fetch apontado para ele.
export type TestFetch = (path: string, init?: RequestInit) => Promise<Response>

export async function withRouter(
  path: string,
  router: Router,
  fn: (get: TestFetch) => Promise<void>,
  { uid = 'u1', tenantId }: { uid?: string; tenantId?: string } = {},
): Promise<void> {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { uid, email: '' }
    if (tenantId) req.tenantId = tenantId
    next()
  })
  app.use(path, router)
  const server = http.createServer(app)
  await new Promise<void>((r) => server.listen(0, r))
  const { port } = server.address() as AddressInfo
  try {
    await fn((p, init) => fetch(`http://127.0.0.1:${port}${p}`, init))
  } finally {
    await new Promise((r) => server.close(r))
  }
}

export const json = { headers: { 'content-type': 'application/json' } }
