// EmptyRepo.tsx — the panel with no repository to show.
//
// The doors are VS Code's own, and which are offered follows the situation:
// a folder is open and is not a repository — initialise it, the one thing to
// do with it; no folder at all — open one, or clone one. The panel has
// nothing of its own to add to any of them, so it says so and hands over;
// the host keeps the list of what it will run (GitVertexHost, `workbench`).
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
        {hasFolder ? (
          /* A folder is open: the one thing to do with it is make it a
             repository — the way VS Code's own Source Control view offers
             only that here. Opening or cloning something else is a change
             of subject, and the workbench has its own doors for that. */
          <button className="gv-empty-btn gv-empty-btn--primary" onClick={() => door('git.init')}>
            <Icon name="repo" size={14} />{t('ext.empty.init')}
          </button>
        ) : (
          <>
            <button className="gv-empty-btn gv-empty-btn--primary" onClick={() => door('vscode.openFolder')}>
              <Icon name="folder" size={14} />{t('ext.empty.openFolder')}
            </button>
            <button className="gv-empty-btn" onClick={() => door('git.clone')}>
              <Icon name="download" size={14} />{t('ext.empty.clone')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
