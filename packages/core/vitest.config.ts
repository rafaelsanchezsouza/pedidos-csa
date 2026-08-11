import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    // node é o padrão: domínio e engine são cálculo/http puro e não pagam o custo do jsdom.
    // Teste de componente (src/ui) declara `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
  plugins: [react()],
})
