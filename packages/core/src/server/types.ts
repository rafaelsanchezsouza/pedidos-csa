// Campos que o engine pendura no Request do express: `user` (posto pelo authMiddleware do
// app) e `tenantId` (posto pelo tenantMiddleware do core). A augmentation vale para o
// programa inteiro assim que qualquer módulo importar @pedidos/core/server.
declare module 'express' {
  interface Request {
    user?: { uid: string; email: string }
    tenantId?: string
  }
}

export {}
