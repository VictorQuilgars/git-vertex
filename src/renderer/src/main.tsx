import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast/Toast'
import { LanguageProvider } from './i18n/LanguageContext'
import { SettingsProvider, THEME_STORAGE_KEY } from './contexts/SettingsContext'
import './App.css'

// Settings arrive over IPC, which is a round trip: the first frame would paint
// with the default theme and only then flip. On a light theme that is a black
// flash. localStorage is synchronous, so the last known choice lands before
// React mounts. settings.json stays the source of truth — this is only a cache.
try {
  const t = localStorage.getItem(THEME_STORAGE_KEY)
  if (t) document.documentElement.dataset.theme = t
} catch { /* private mode: accept the flash */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <LanguageProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </LanguageProvider>
    </SettingsProvider>
  </React.StrictMode>
)
