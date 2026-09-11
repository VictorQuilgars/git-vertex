import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/Toast/Toast'
import { JournalProvider } from './contexts/JournalContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { SettingsProvider, THEME_STORAGE_KEY, THEME_SEEDS_KEY, DENSITY_STORAGE_KEY, resolveDensity, cssRuleFor } from './contexts/SettingsContext'
import './App.css'

// Settings arrive over IPC, which is a round trip: the first frame would paint
// with the default theme and only then flip. On a light theme that is a black
// flash. localStorage is synchronous, so the last known choice lands before
// React mounts. settings.json stays the source of truth — this is only a cache.
try {
  const t = localStorage.getItem(THEME_STORAGE_KEY)
  if (t) {
    document.documentElement.dataset.theme = t
    // An INSTALLED theme has no block in tokens.css, so the attribute alone
    // selects nothing and the frame paints unstyled — worse than the flash this
    // block exists to prevent. Its seeds are mirrored next to the id, so the
    // rule can be rebuilt here, synchronously, before anything renders.
    const raw = localStorage.getItem(THEME_SEEDS_KEY)
    if (raw) {
      const rule = cssRuleFor(t, JSON.parse(raw))
      if (rule) {
        const el = document.createElement('style')
        el.id = 'gv-installed-theme-boot'
        el.textContent = rule
        document.head.appendChild(el)
      }
    }
  }
} catch { /* private mode, or a mangled mirror: accept the flash */ }

// The density, for the same reason and from the same cache (#195). It moves row
// heights and padding rather than colours, so getting it late is not a flash —
// it is the whole window resizing its rows one frame in.
try {
  document.documentElement.dataset.density = resolveDensity(localStorage.getItem(DENSITY_STORAGE_KEY))
} catch { /* private mode: the default is already what :root carries */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <LanguageProvider>
        {/* Above the toasts: a chip is written into the journal as it is
            raised, and an error chip links back to its own entry there. */}
        <JournalProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </JournalProvider>
      </LanguageProvider>
    </SettingsProvider>
  </React.StrictMode>
)
