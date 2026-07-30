import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyBrand } from '@/lib/brand'

// Aplica a paleta/nome/ícone do tenant antes do primeiro render (ver src/lib/brand.ts).
applyBrand()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
