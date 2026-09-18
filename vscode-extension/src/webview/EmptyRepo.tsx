// EmptyRepo.tsx — the panel with no repository to show.
//
// Three doors, and every one of them is VS Code's own: open a folder, clone
// (the built-in git extension's dialog), initialise the workspace folder. The
// panel has nothing of its own to add to any of them, so it says so and
// hands over — the host keeps the list of what it will run (GitVertexHost,
// `workbench`).
import React from 'react'
import { Mark } from '../../../src/renderer/src/components/Mark/Mark'
import { Icon } from '../../../src/renderer/src/components/Icon/Icon'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'

export default function EmptyRepo({ hasFolder }: { hasFolder: boolean }) {
  const { t } = useLang()
  const door = (id: 'vscode.openFolder' | 'git.clone' | 'git.init') => { void window.gitAPI.workbench(id) }
  return (
    <div className="gv-empty" role="group" aria-label={t('ext.empty.title')}>
      <Mark size={40} className="gv-empty-mark" />
      <h2 className="gv-empty-title">{t('ext.empty.title')}</h2>
      <p className="gv-empty-body">{hasFolder ? t('ext.empty.bodyFolder') : t('ext.empty.bodyNone')}</p>
      <div className="gv-empty-actions">
        <button className="gv-empty-btn" onClick={() => door('vscode.openFolder')}>
          <Icon name="folder" size={14} />{t('ext.empty.openFolder')}
        </button>
        <button className="gv-empty-btn" onClick={() => door('git.clone')}>
          <Icon name="download" size={14} />{t('ext.empty.clone')}
        </button>
        {hasFolder && (
          <button className="gv-empty-btn gv-empty-btn--primary" onClick={() => door('git.init')}>
            <Icon name="repo" size={14} />{t('ext.empty.init')}
          </button>
        )}
      </div>
    </div>
  )
}
