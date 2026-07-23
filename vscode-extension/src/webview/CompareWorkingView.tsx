// CompareWorkingView — "Compare Working Tree to Here" in its own editor tab.
// Mirrors the desktop CompareWorkingModal (App.tsx) but as a full-page tab
// instead of a modal, matching every other VS Code tool tab in this extension.

import React, { useState, useEffect } from 'react'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import DiffViewer from '../../../src/renderer/src/components/DiffViewer/DiffViewer'
import type { CommitNode } from '../../../src/renderer/src/types'

declare global { interface Window { gitAPI: any } }

function syntheticCommit(shortHash: string, message: string): CommitNode {
  return { hash: shortHash, shortHash, message, author: '', authorEmail: '', date: '', parents: [], refs: [] }
}

export default function CompareWorkingView({ hash }: { hash: string }) {
  const { t } = useLang();

  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.gitAPI.diffCommitToWorking(hash).then((r: { diff?: string }) => {
      setDiff(r?.diff ?? '')
      setLoading(false)
    })
  }, [hash])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!loading && diff.trim() === '' ? (
        <div style={{ padding: 24, color: '#8b949e' }}>Aucune différence avec le répertoire de travail</div>
      ) : (
        <DiffViewer
          commit={syntheticCommit(hash.slice(0, 7), t('ext.compare.workingDir'))}
          diff={diff}
          files={[]}
          loading={loading}
        />
      )}
    </div>
  )
}
