// Barrel do ENGINE (server-only). Não é reexportado pelo barrel raiz de propósito: o front
// importa '@pedidos/core' e não pode arrastar express para o bundle.
import './types.js'

export * from './repo.js'
export { createTenantMiddleware } from './middleware/tenant.js'
export { createTenantsRouter, type TenantDoc } from './routes/tenants.js'
