import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// StrictMode highlights unsafe React patterns during development. It does not
// render any additional UI in production builds.
createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)
