// Sidebar › contributors. Who has committed here, most commits first, as
// git's shortlog counts them; a row narrows the graph to that author, the
// same row again widens it back. Reads its slice of the sidebar's state; the
// state itself lives in useSidebar.
import { Icon } from '../../Icon/Icon'
import { Section } from '../Section'
import type { SidebarState } from '../useSidebar'

export function ContributorsSection({ s }: { s: SidebarState }) {
  const { contributors, onFilterAuthor, authorFilter, t } = s
  if (!onFilterAuthor) return null
  return (
    <Section id="contributors" title="CONTRIBUTORS" icon="person" count={contributors.length} defaultOpen={false}>
      {contributors.length === 0
        ? <div className="sb-empty">{t('sb.contributorsEmpty')}</div>
        : contributors.map(c => {
            const active = authorFilter === c.name
            return (
              <button key={`${c.name} <${c.email}>`}
                className={`sb-contrib-row${active ? ' sb-contrib-row--active' : ''}`}
                title={active ? t('sb.contributors.clear') : t('sb.contributors.filter', c.name)}
                aria-pressed={active}
                onClick={() => onFilterAuthor(active ? null : c.name)}>
                <Icon name="person" size={12} />
                <span className="sb-contrib-name">{c.name}</span>
                <span className="sb-contrib-count">{c.commits}</span>
              </button>
            )
          })
      }
    </Section>
  )
}
