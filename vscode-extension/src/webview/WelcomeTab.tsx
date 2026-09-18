// WelcomeTab.tsx — what the extension does, and where, on one page.
//
// Opened once, on a fresh install (an update opens What's new instead), and
// by Git Vertex: Welcome after that. Six cards, each with a gesture: the
// buttons run this extension's own commands through the host's allow-list,
// so the page can point at a feature rather than describe where to find it.
import React from 'react'
import { Mark } from '../../../src/renderer/src/components/Mark/Mark'
import { Icon, type IconName } from '../../../src/renderer/src/components/Icon/Icon'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'

interface Card {
  key: string
  icon: IconName
  title: string
  body: string
  actions: { label: string; command: string; primary?: boolean }[]
}

export default function WelcomeTab() {
  const { t } = useLang()
  const run = (command: string) => { void window.gitAPI.workbench(command) }
  const cards: Card[] = [
    {
      key: 'graph', icon: 'commit', title: t('welcome.graph.title'), body: t('welcome.graph.body'),
      actions: [
        { label: t('welcome.graph.show'), command: 'gitVertex.openPanel', primary: true },
        { label: t('welcome.graph.sideBar'), command: 'gitVertex.moveToSideBar' },
      ],
    },
    {
      key: 'commit', icon: 'staging', title: t('welcome.commit.title'), body: t('welcome.commit.body'),
      actions: [{ label: t('welcome.graph.show'), command: 'gitVertex.openPanel' }],
    },
    {
      key: 'blame', icon: 'blame', title: t('welcome.blame.title'), body: t('welcome.blame.body'),
      actions: [
        { label: t('welcome.blame.line'), command: 'gitVertex.toggleLineBlame' },
        { label: t('welcome.blame.file'), command: 'gitVertex.toggleFileBlame' },
      ],
    },
    {
      key: 'reach', icon: 'terminal', title: t('welcome.reach.title'), body: t('welcome.reach.body'),
      actions: [
        { label: t('welcome.reach.show'), command: 'gitVertex.revealCommit' },
        { label: t('welcome.reach.follow'), command: 'gitVertex.toggleFollowCursor' },
      ],
    },
    {
      key: 'ai', icon: 'ai', title: t('welcome.ai.title'), body: t('welcome.ai.body'),
      actions: [{ label: t('welcome.settings'), command: 'gitVertex.openPanelSettings' }],
    },
    {
      key: 'look', icon: 'ink', title: t('welcome.look.title'), body: t('welcome.look.body'),
      actions: [{ label: t('welcome.settings'), command: 'gitVertex.openPanelSettings' }],
    },
  ]
  return (
    <div className="gvw">
      <header className="gvw-head">
        <Mark size={40} />
        <div>
          <h1 className="gvw-title">{t('welcome.title')}</h1>
          <p className="gvw-lede">{t('welcome.lede')}</p>
        </div>
      </header>
      <div className="gvw-grid">
        {cards.map(c => (
          <section key={c.key} className="gvw-card" aria-labelledby={`gvw-${c.key}`}>
            <div className="gvw-card-head">
              <Icon name={c.icon} size={18} className="gvw-card-icon" />
              <h2 id={`gvw-${c.key}`} className="gvw-card-title">{c.title}</h2>
            </div>
            <p className="gvw-card-body">{c.body}</p>
            <div className="gvw-card-actions">
              {c.actions.map(a => (
                <button key={a.command} className={`gvw-btn${a.primary ? ' gvw-btn--primary' : ''}`} onClick={() => run(a.command)}>
                  {a.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="gvw-foot">
        <button className="gvw-link" onClick={() => run('gitVertex.showWhatsNew')}>{t('welcome.whatsNew')}</button>
        <span className="gvw-foot-note">{t('welcome.reopen')}</span>
      </footer>
    </div>
  )
}
