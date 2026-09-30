// Sidebar › ai-changelogs. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { ChangelogRow } from '../ai-rows'
import type { SidebarState } from '../useSidebar'
import { LoadError } from '../notices'

export function AiChangelogsSection({ s }: { s: SidebarState }) {
  const { onOpenChangelog, onShowCommits, t, changelogs, loadMemory, loadErrors, retryLoad } = s
  const failed = loadErrors.changelogs
  return (
    <Section id="ai-changelogs" title="CHANGELOGS" icon="ai" count={failed ? undefined : changelogs.length} defaultOpen
                menuItems={changelogs.some(c => c.subject === 'lost') ? [{
                  label: t('sb.ai.forgetGone'),
                  action: async () => {
                    for (const c of changelogs.filter(x => x.subject === 'lost')) {
                      await (window.gitAPI as any).aiForgetChangelog?.(c.branch)
                    }
                    loadMemory()
                  },
                  danger: true,
                }] : undefined}>
                {failed ? <LoadError error={failed} onRetry={() => retryLoad('changelogs')} t={t} />
                  : changelogs.length === 0
                  ? <div className="sb-empty">{t('sb.ai.noChangelog')}</div>
                  : changelogs.map(c => (
                      <ChangelogRow
                        key={c.branch}
                        entry={c}
                        onShowCommits={onShowCommits}
                        onOpen={onOpenChangelog ? () => onOpenChangelog(c.branch) : undefined}
                        onForget={async () => {
                          await (window.gitAPI as any).aiForgetChangelog?.(c.branch)
                          loadMemory()
                        }}
                      />
                    ))
                }
              </Section>
  )
}
