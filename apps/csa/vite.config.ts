import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  test: {
    // node é o padrão: cálculo puro (weekUtils, weekMath) não paga o custo do jsdom.
    // Teste de componente declara `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',
    // 5s (padrão) não serve para os testes de componente: cada um sobe um jsdom, e a suíte
    // roda em paralelo. Isolados levam ~0,5s; sob contenção estouravam os 5s e a suíte ficava
    // vermelha de forma aleatória. Como o verde local é o ÚNICO portão aqui, portão que pisca
    // é pior que portão nenhum — ensina a ignorar vermelho.
    testTimeout: 20000,
    hookTimeout: 20000,
    include: ['{src,server,scripts}/**/*.test.{ts,tsx}'],
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
