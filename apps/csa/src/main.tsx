import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyBrand } from '@pedidos/core/ui'
import './index.css'
import App from './App.tsx'
import { BRAND } from './config'

// Aplica a paleta/nome/ícone do tenant antes do primeiro render (ver src/config.ts).
// 'light': nenhum dos apps ativa a classe .dark do Tailwind — as telas são sempre claras.
applyBrand(BRAND, 'light')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
