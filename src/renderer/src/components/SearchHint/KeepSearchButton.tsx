import { useKept, type KeptSearch } from '../../hooks/useKept'
import { useLang } from '../../i18n/LanguageContext'

export function KeepSearchButton({ repo, search, loading }: { repo: string | null; search: KeptSearch; loading?: boolean }) {
  const { t } = useLang()
  const kept = useKept(repo)
  if (!repo || !search.query.trim()) return null
  const saved = kept.entries.some(e => e.kind === 'search' && e.query === search.query && e.ai === search.ai
    && JSON.stringify(e.hashes) === JSON.stringify(search.hashes) && JSON.stringify(e.requiredHashes) === JSON.stringify(search.requiredHashes))
  return <>
    <button type="button" disabled={loading || saved} onClick={() => void kept.keep(search, search.query)}>{t(saved ? 'kept.saved' : 'kept.keep')}</button>
    {kept.error && <span role="alert">{t('kept.error')}</span>}
  </>
}
