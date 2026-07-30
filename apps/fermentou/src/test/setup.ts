// Setup global do vitest.
//
// `@testing-library/jest-dom` só faz sentido com DOM; em ambiente `node` (weekUtils,
// weekMath) o import é ignorado para não pagar o custo nem quebrar.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')
  const { afterEach } = await import('vitest')
  afterEach(() => cleanup())
}
