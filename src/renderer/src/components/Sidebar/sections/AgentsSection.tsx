// Sidebar › agents. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import type { SidebarState } from '../useSidebar'

export function AgentsSection({ s }: { s: SidebarState }) {
  const { agents, t } = s
  return (
    <Section id="agents" title="AGENTS" icon="agent" count={agents.length} defaultOpen>
              {agents.length === 0
                ? <div className="sb-empty">{t('sb.noAgent')}</div>
                : agents.map(a => (
                    <div key={a.pid} className="sb-submodule-item" title={a.cwd}>
                      <span className="sb-agent-dot" />
                      <div className="sb-sub-info">
                        <span className="sb-sub-path">
                          {a.name} <code style={{ opacity: 0.6 }}>pid {a.pid}</code>
                        </span>
                        <span className="sb-sub-url">{a.cwd}</span>
                      </div>
                    </div>
                  ))
              }
            </Section>
  )
}
