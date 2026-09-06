// Sidebar › ai-explanations. Reads its slice of the sidebar's state; the state itself lives in useSidebar.
import { Section } from '../Section'
import { NoteRow } from '../ai-rows'
import type { SidebarState } from '../useSidebar'

export function AiExplanationsSection({ s }: { s: SidebarState }) {
  const { onOpenExplanation, onOpenNote, onShowCommits, subjectFor, t, explanations, notes, loadMemory } = s
  return (
    <Section id="ai-explanations" title="EXPLANATIONS" icon="comment"
                count={notes.length + Object.keys(explanations).length} defaultOpen
                menuItems={notes.some(n => n.subject === 'lost') ? [{
                  label: t('sb.ai.forgetGone'),
                  action: async () => {
                    for (const n of notes.filter(x => x.subject === 'lost')) {
                      await (window.gitAPI as any).aiForgetNote?.(n.kind, n.key)
                    }
                    loadMemory()
                  },
                  danger: true,
                }] : undefined}>
                {notes.length + Object.keys(explanations).length === 0
                  ? <div className="sb-empty">{t('sb.ai.noExplanation')}</div>
                  : <>
                      {notes.map(n => (
                        <NoteRow
                          key={`${n.kind}:${n.key}`}
                          note={n}
                          onShowCommits={onShowCommits}
                          onOpen={onOpenNote ? () => onOpenNote(n) : undefined}
                          onForget={async () => {
                            await (window.gitAPI as any).aiForgetNote?.(n.kind, n.key)
                            loadMemory()
                          }}
                        />
                      ))}
                      {Object.entries(explanations).reverse().map(([hash, text]) => (
                        <NoteRow
                          key={hash}
                          note={{
                            kind: 'commit', key: hash,
                            title: subjectFor?.(hash) ?? t('sb.ai.unknownCommit'),
                            text, at: 0, sha: hash, newCommits: 0, hashes: [hash],
                          }}
                          onShowCommits={onShowCommits}
                          onOpen={onOpenExplanation ? () => onOpenExplanation(hash) : undefined}
                          onForget={async () => {
                            await (window.gitAPI as any).aiForgetExplanation?.(hash)
                            loadMemory()
                          }}
                        />
                      ))}
                    </>
                }
              </Section>
  )
}
