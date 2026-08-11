import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyBrand } from '@pedidos/core/ui'
import './index.css'
import App from './App.tsx'
import { BRAND } from '@/lib/brand'

// Aplica a paleta/nome/ícone do tenant antes do primeiro render (ver src/lib/brand.ts).
// 'light': nenhum dos apps ativa a classe .dark do Tailwind — as telas são sempre claras.
applyBrand(BRAND, 'light')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
