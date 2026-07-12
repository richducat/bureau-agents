import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/manrope'
import '@fontsource/ibm-plex-mono/400.css'
import './index.css'
import App from './App'

const basename = window.location.hostname.endsWith('github.io') ? '/bureau-agents' : undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
