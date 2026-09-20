import { useState } from 'react'
import { useKept, type KeptEntry } from '../../../hooks/useKept'
import { useLang } from '../../../i18n/LanguageContext'

export function KeptSection({ repo, onOpen }: { repo: string; onOpen: (entry: KeptEntry) => void }) {
  const { t } = useLang()
  const kept = useKept(repo)
  const [editing, setEditing] = useState<string | null>(null)
  return <section className="sb-kept" aria-label={t('kept.title')}>
    <div className="sb-ov-head"><span className="sb-ov-label">{t('kept.title')}</span></div>
    {kept.error && <div role="alert">{t('kept.error')}</div>}
    {!kept.entries.length && <div className="sb-empty">{t('kept.empty')}</div>}
    {kept.entries.map(entry => <div className="sb-kept-row" key={entry.id}>
      {editing === entry.id ? <input autoFocus aria-label={t('kept.name')} defaultValue={entry.name}
        onBlur={e => { void kept.rename(entry.id, e.target.value); setEditing(null) }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = entry.name; e.currentTarget.blur() } }} />
        : <button className="sb-kept-open" onClick={() => onOpen(entry)} title={entry.name}>
          <span>{entry.kind === 'comparison' ? '⇄' : '⌕'} {entry.name}</span>
          <time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString(t('graph.dateLocale'))}</time>
        </button>}
      <button title={t('kept.rename')} aria-label={`${t('kept.rename')}: ${entry.name}`} onClick={() => setEditing(entry.id)}>✎</button>
      <button title={t('kept.remove')} aria-label={`${t('kept.remove')}: ${entry.name}`} onClick={() => void kept.remove(entry.id)}>×</button>
    </div>)}
  </section>
}
