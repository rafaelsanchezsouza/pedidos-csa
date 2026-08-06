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
export {
  createPaymentService, PRODUCER_COTA, PRODUCER_FRETE,
  type PaymentService, type PaymentDoc,
} from './services/payments.js'
export { createPaymentsRouter, type PaymentsDeps } from './routes/payments.js'
export { createOrdersService, type OrdersService } from './services/orders.js'
export { createOrdersRouter, type OrdersDeps, type OrderDoc, type OrderItem } from './routes/orders.js'
export { normalizePhone } from './phone.js'
export { createWhatsappAuthRouter, type WhatsappAuthDeps } from './routes/whatsappAuth.js'
export type { MessageParser, ExistingProduct, ParsedProduct } from './parseMessage.js'
export { fuzzyMessageParser } from './fuzzyParser.js'
export {
  createOfferingsRouter,
  type OfferingsDeps, type OfferingDoc, type OfferingItem,
} from './routes/offerings.js'
