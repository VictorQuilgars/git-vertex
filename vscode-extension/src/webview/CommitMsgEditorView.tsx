// CommitMsgEditorView — the COMMIT_EDITMSG custom editor UI (boot mode
// 'commitMsg'). Whatever invokes core.editor opens this: a reword or squash
// step during an interactive rebase, a plain `git commit` (no -m), a merge
// commit, `git tag -a`, etc. Saving writes the message and closes the tab,
// which is what `code --wait` (core.editor) is blocked on; git applies its
// own cleanup (stripping '#' comment lines, trimming blank lines) on top.
import React, { useState, useCallback } from 'react'
import '../../../src/renderer/src/components/RebaseProgress/RebaseProgress.css'

declare global { interface Window { gitAPI: any } }

interface CommitMsgBoot {
  initialMessage?: string
  action?: string          // 'reword' | 'squash' | undefined (plain commit/merge/tag)
  subject?: string         // original subject line, for reword context
  stepCurrent?: number
  stepTotal?: number
}

function titleFor(boot: CommitMsgBoot): string {
  if (boot.action === 'reword') return '✏️ Reword — reformuler le message'
  if (boot.action === 'squash') return '🔗 Squash — message combiné'
  return '📝 Message de commit'
}

export default function CommitMsgEditorView({ boot }: { boot: CommitMsgBoot }) {
  const [text, setText] = useState(boot.initialMessage ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.gitAPI.commitMsgSave(text)
    } finally {
      setSaving(false)
    }
  }, [text])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSave()
    }
  }, [handleSave])

  const hasStep = typeof boot.stepCurrent === 'number' && typeof boot.stepTotal === 'number'

  return (
    <div className="rp-page">
      <div className="rp-header">
        <div className="rp-header-top">
          <span className="rp-title">{titleFor(boot)}</span>
        </div>
        {(hasStep || boot.subject) && (
          <div className="rp-header-refs">
            {hasStep && <span className="rp-ref-chip">{boot.stepCurrent}/{boot.stepTotal} commits</span>}
            {boot.subject && (
              <span className="rp-ref-onto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {boot.subject}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        <span className="rp-msg-editor-label">Message de commit</span>
        <textarea
          className="rp-msg-textarea"
          style={{ flex: 1, minHeight: 160, resize: 'vertical' }}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoFocus
        />
      </div>

      <div className="rp-legend">Les lignes commençant par « # » et les lignes vides en fin de message sont retirées automatiquement par git.</div>

      <div className="rp-footer">
        <span className="rp-footer-spring" />
        <button
          className="rp-btn rp-btn--continue"
          disabled={saving || !text.trim()}
          onClick={handleSave}
          title="Enregistrer et continuer (Ctrl+Entrée)"
        >
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
