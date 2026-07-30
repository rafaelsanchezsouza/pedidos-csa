// Flags de recurso do app. Camada simples para ligar/desligar comportamento por deploy.

// Multi-organização (multi-loja). DESLIGADO por default: com uma loja só, some toda a
// UI de organização — o nome no header/sidebar E a aba "Organizações" na Administração.
// Ligar (true) quando for gerir mais de uma loja no mesmo app.
export const MULTI_TENANT = false
