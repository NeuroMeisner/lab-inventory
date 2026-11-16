import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { useOutboxStore } from './store/outbox'

registerSW({ immediate: true })

// Досылка офлайн-операций при старте и при появлении сети
useOutboxStore.getState().flush()
window.addEventListener('online', () => useOutboxStore.getState().flush())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)