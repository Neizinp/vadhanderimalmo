import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './base.css'
import EventGuide from './EventGuide.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EventGuide />
  </StrictMode>,
)
