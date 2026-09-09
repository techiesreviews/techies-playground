import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Preview from './Preview'
import { PREVIEW_PREFIX } from './lib/playground-preview'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.hash.startsWith(PREVIEW_PREFIX) ? <Preview /> : <App />}
  </StrictMode>,
)
