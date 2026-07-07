import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AppErrorBoundary, initMonitoring } from './monitoring/sentry.jsx'
import './styles.css'

initMonitoring()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
