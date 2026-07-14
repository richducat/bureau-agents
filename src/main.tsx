import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/manrope'
import '@fontsource/ibm-plex-mono/400.css'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CommercialReadinessProvider } from './context/CommercialReadinessContext'

const basename = window.location.hostname.endsWith('github.io') ? '/bureau-agents' : undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <CommercialReadinessProvider><AuthProvider><App /></AuthProvider></CommercialReadinessProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
