// The graph's keys, on one sheet — `?` opens it (#253). A centred dialog in
// groups, the keys right-aligned in a column of their own so the eye runs down
// the labels. Everything listed here is handled in CommitGraph's key handler:
// a row added there is added here, and graph-shortcuts.test.tsx reads both.
import React, { useId } from 'react'
import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import { useDialogFocus } from '../Dialog/useDialogFocus'
import { isMac } from '../../utils/platform'
import './GraphShortcuts.css'

type TKey = Parameters<ReturnType<typeof useLang>['t']>[0]

export interface ShortcutRow { keys: string[]; label: TKey }
export interface ShortcutGroup { title: TKey; rows: ShortcutRow[] }

/** The sheet's content. `Mod` is ⌘ on a Mac and Ctrl elsewhere. */
export const GRAPH_SHORTCUTS: ShortcutGroup[] = [
  { title: 'graph.keys.navigation', rows: [
    { keys: ['↑'], label: 'graph.keys.up' },
    { keys: ['↓'], label: 'graph.keys.down' },
    { keys: ['Home'], label: 'graph.keys.home' },
    { keys: ['End'], label: 'graph.keys.end' },
  ] },
  { title: 'graph.keys.goTo', rows: [
    { keys: ['w'], label: 'graph.keys.wip' },
    { keys: ['h'], label: 'graph.keys.head' },
    { keys: ['u'], label: 'graph.keys.upstream' },
    { keys: ['t'], label: 'graph.keys.target' },
  ] },
  { title: 'graph.keys.selection', rows: [
    { keys: ['Shift', 'Click'], label: 'graph.keys.range' },
    { keys: ['Mod', 'Click'], label: 'graph.keys.toggle' },
    { keys: ['Esc'], label: 'graph.keys.escape' },
  ] },
  { title: 'graph.keys.find', rows: [
    { keys: ['/'], label: 'graph.keys.finder' },
    { keys: ['?'], label: 'graph.keys.help' },
  ] },
]

export default function GraphShortcuts({ onClose }: { onClose: () => void }) {
  const { t } = useLang()
  const titleId = useId()
  const boxRef = useDialogFocus(onClose)
  const mac = isMac()
  const face = (key: string) => key === 'Mod' ? (mac ? '⌘' : 'Ctrl') : key === 'Click' ? t('graph.keys.click') : key
  return (
    <div className="dlg-overlay" onMouseDown={onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="cg-keys" onMouseDown={e => e.stopPropagation()}>
        <header className="cg-keys-head">
          <Icon name="commandPalette" size={14} />
          <h2 id={titleId} className="cg-keys-title">{t('graph.keys.title')}</h2>
          <button type="button" className="cg-keys-close" title={t('common.close')} aria-label={t('common.close')} onClick={onClose}>×</button>
        </header>
        <div className="cg-keys-body">
          {GRAPH_SHORTCUTS.map(group => (
            <section key={group.title} className="cg-keys-group">
              <h3 className="cg-keys-group-title">{t(group.title)}</h3>
              <dl className="cg-keys-list">
                {group.rows.map(row => (
                  <div key={row.label} className="cg-keys-row">
                    <dt className="cg-keys-keys">
                      {row.keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className="cg-keys-plus">+</span>}
                          <kbd>{face(k)}</kbd>
                        </React.Fragment>
                      ))}
                    </dt>
                    <dd className="cg-keys-label">{t(row.label)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <footer className="cg-keys-foot">{t('graph.keys.foot')}</footer>
      </div>
    </div>
  )
}
