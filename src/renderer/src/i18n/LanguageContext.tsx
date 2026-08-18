import React, { createContext, useContext, useState, useCallback } from 'react'
import { Lang, TranslationKey, translations } from './translations'

/**
 * What a key expects after itself: a plain string entry takes nothing, an
 * entry that is a function takes that function's parameters.
 *
 * It used to be `Parameters<Extract<value, Function>>`, which is right for the
 * function half and `never` for the other — and a `never` rest parameter
 * rejects the empty argument list, so *every* `t('some.key')` in the codebase
 * was a type error. There were 891 of them in the panel and 1049 in the
 * desktop renderer, which is why nothing type-checked either surface, which is
 * how `I is not defined` shipped.
 */
type TArgs<K extends TranslationKey> =
  (typeof translations)['fr'][K] extends (...a: infer A) => any ? A : []

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: <K extends TranslationKey>(key: K, ...args: TArgs<K>) => string
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
