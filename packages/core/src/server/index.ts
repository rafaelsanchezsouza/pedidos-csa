// Barrel do ENGINE (server-only). Não é reexportado pelo barrel raiz de propósito: o front
// importa '@pedidos/core' e não pode arrastar express para o bundle.
import './types.js'

export * from './repo.js'
export { createTenantMiddleware } from './middleware/tenant.js'
export { createTenantsRouter, type TenantDoc } from './routes/tenants.js'
export { createRolesRouter, type RoleDoc } from './routes/roles.js'
export { createProducersRouter, type ProducerDoc } from './routes/producers.js'
export { createProductsRouter, type ProductDoc } from './routes/products.js'
export { createIssuesRouter, type GithubIssuesIntegration } from './routes/issues.js'
export { createUsersRouter, type UsersDeps, type UserDoc } from './routes/users.js'
