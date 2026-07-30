import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Domínio é cálculo puro (sem DOM): node basta.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
