import React, { createContext, useContext, useState, useCallback } from 'react'
import { Lang, TranslationKey, translations } from './translations'

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: <K extends TranslationKey>(key: K, ...args: Parameters<Extract<(typeof translations)['fr'][K], (...a: any[]) => any>>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

// The app currently ships English-only. French is *disconnected*, not removed:
// its translations still live in translations.ts. To re-enable French later,
// just add 'fr' back to ENABLED_LANGS — the language switcher and persistence
// pick it up automatically.
export const ENABLED_LANGS: Lang[] = ['en']
const DEFAULT_LANG: Lang = 'en'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('lang') as Lang | null
    return stored && ENABLED_LANGS.includes(stored) ? stored : DEFAULT_LANG
  })

  const setLang = useCallback((l: Lang) => {
    if (!ENABLED_LANGS.includes(l)) return
    localStorage.setItem('lang', l)
    setLangState(l)
  }, [])

  const t = useCallback(<K extends TranslationKey>(key: K, ...args: any[]): string => {
    const val = translations[lang][key] ?? translations[DEFAULT_LANG][key]
    if (typeof val === 'function') return (val as (...a: any[]) => string)(...args)
    return val as string
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider')
  return ctx
}
