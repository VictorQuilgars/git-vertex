import React, { createContext, useContext, useState, useCallback } from 'react'
import { Lang, TranslationKey, translations } from './translations'

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: <K extends TranslationKey>(key: K, ...args: Parameters<Extract<(typeof translations)['fr'][K], (...a: any[]) => any>>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem('lang') as Lang) ?? 'fr'
  )

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('lang', l)
    setLangState(l)
  }, [])

  const t = useCallback(<K extends TranslationKey>(key: K, ...args: any[]): string => {
    const val = translations[lang][key] ?? translations['fr'][key]
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
