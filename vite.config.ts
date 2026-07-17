import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  test: {
    // node é o padrão: cálculo puro (weekUtils, weekMath) não paga o custo do jsdom.
    // Teste de componente declara `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',
    include: ['{src,server}/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
