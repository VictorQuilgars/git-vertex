// The right pane's root: which of the three views shows for the selection.

import { useCommitDraft } from '../../hooks/useCommitDraft'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../Icon/Icon'
import hljs from 'highlight.js'
import { CommitNode, ConflictKind, FileChange, WorkingChanges } from '../../types'
import { CenterDiffTarget } from '../CenterFileDiff/CenterFileDiff'
import { useLang } from '../../i18n/LanguageContext'
import { aiAvatarDataUri } from '../../utils/aiAvatars'
import { linkifyIssues, IssueRepo } from '../IssueLink/IssueLink'
import { parseAutolinks } from '../../utils/autolinks'
import { useSettings } from '../../contexts/SettingsContext'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import BranchStrip, { type BranchStripProps } from './BranchStrip'
import './RightPanel.css'
import WorkingChangesEmpty, { type NextStepsState, type NextStepsActions } from './WorkingChangesEmpty'
import { hasIssueReferences } from '../IssueLink/IssueLink'
import { CommitDetail } from './CommitDetail'
import { ConflictPanel } from './ConflictPanel'
import { StagingView } from './StagingView'

// ── Right Panel root ──────────────────────────────────────────
export interface RightPanelProps {
  repoPath?: string
  selectedCommit: CommitNode | null
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  onSelectCommit: (hash: string) => void
  currentBranch?: string
  wipCount?: number
  onViewWip?: () => void
  conflictFiles?: string[]
  // path → unmerged state. Absent/empty ⇒ the host does not report it and no
  // kind is shown, rather than every file being labelled "both modified".
  conflictKinds?: Record<string, ConflictKind>
  conflictMode?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void | boolean | Promise<void | boolean>
  onConflictAbort?: () => void
  onOpenResolver?: (file: string) => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  onOpenStagingEditor?: (file: string) => void
  githubRepo?: IssueRepo | null
  /** Right-click on a file in a commit: link to it on the remote. */
  onOpenFileOnRemote?: (hash: string, filePath: string) => void
  onCopyFileLink?: (hash: string, filePath: string) => void
  /** Put this file back the way it was at this commit. Asks first. */
  onRestoreFile?: (hash: string, filePath: string) => void
  /**
   * Show this file's history — the host decides where a view goes: a tab in the
   * app, an editor tab in the panel. Omitted ⇒ the button disappears rather
   * than opening nothing.
   */
  onOpenFileHistory?: (filePath: string) => void
  /** Compare a commit against the working tree, from the detail pane. */
  onCompareWorking?: (hash: string) => void
  /** Apply a message to a commit that is not the tip — see CommitDetail. */
  onRewordMessage?: (hash: string, message: string) => void | Promise<void>
  // Agent-proposed commit (MCP propose_commit): message preloaded into the
  // form + proposed file list shown for one-click staging. Review only —
  // nothing is staged or committed until the user acts.
  commitProposal?: { message: string; files: string[] } | null
  onCommitProposalConsumed?: () => void
  /** The working tree's two AI actions (#70 P1), passed to the staging pane. */
  onExplainWorking?: () => void
  onSplitCommits?: () => void
  // VS Code panel: use the compact single-list (checkbox) staging layout
  // instead of the desktop's Unstaged/Staged two-section view.
  embedded?: boolean
  // Branch strip above the file list (v1.22.0). Omitted ⇒ no strip, so hosts
  // that cannot supply branch actions are unaffected.
  branchStrip?: BranchStripProps
  /** What the staging pane shows on a clean tree — the panel supplies it. */
  emptyState?: { state: NextStepsState; actions: NextStepsActions }
}

export default function RightPanel({
  repoPath, selectedCommit, onCommitSuccess, showToast, onSelectCommit, currentBranch, wipCount, onViewWip,
  conflictFiles, conflictKinds, conflictMode, onConflictFinish, onConflictAbort, onOpenResolver, onOpenFileDiff, onOpenStagingEditor, githubRepo,
  onOpenFileOnRemote, onCopyFileLink, onRestoreFile, onOpenFileHistory, onCompareWorking,
  onRewordMessage, commitProposal, onCommitProposalConsumed, onExplainWorking, onSplitCommits,
  embedded, branchStrip, emptyState
}: RightPanelProps) {
  const isWip = selectedCommit?.hash === '__WIP__'
  const hasCommit = !!selectedCommit && !isWip
  const isConflict = conflictMode !== null && conflictMode !== undefined

  const hasUnresolvedConflicts = isConflict && (conflictFiles?.length ?? 0) > 0
  const allConflictsResolved = isConflict && (conflictFiles?.length ?? 0) === 0

  return (
    <div className="right-panel">
      {hasUnresolvedConflicts ? (
        <ConflictPanel
          conflictFiles={conflictFiles ?? []}
          conflictKinds={conflictKinds ?? {}}
          conflictMode={conflictMode!}
          onConflictFinish={onConflictFinish!}
          onConflictAbort={onConflictAbort!}
          onOpenResolver={onOpenResolver!}
          showToast={showToast}
          onCommitSuccess={onCommitSuccess}
        />
      ) : (isWip || allConflictsResolved) && !hasCommit ? (
        <StagingView
          key={repoPath}
          repoPath={repoPath}
          onCommitSuccess={onCommitSuccess}
          showToast={showToast}
          currentBranch={currentBranch}
          conflictMode={allConflictsResolved ? conflictMode : null}
          conflictFiles={conflictFiles}
          onConflictFinish={onConflictFinish}
          onConflictAbort={onConflictAbort}
          onOpenFileDiff={onOpenFileDiff}
          onOpenStagingEditor={onOpenStagingEditor}
          commitProposal={commitProposal}
          onProposalConsumed={onCommitProposalConsumed}
          onExplainWorking={onExplainWorking}
          onSplitCommits={onSplitCommits}
          embedded={embedded}
          branchStrip={branchStrip}
          emptyState={emptyState}
        />
      ) : hasCommit ? (
        <CommitDetail
          commit={selectedCommit}
          onSelectCommit={onSelectCommit}
          wipCount={wipCount}
          onViewWip={onViewWip}
          onOpenFileDiff={onOpenFileDiff}
          onAmendSuccess={onCommitSuccess}
          githubRepo={githubRepo}
          onOpenFileOnRemote={onOpenFileOnRemote}
          onCopyFileLink={onCopyFileLink}
          onRestoreFile={onRestoreFile}
          onOpenFileHistory={onOpenFileHistory}
          onCompareWorking={onCompareWorking}
          onRewordMessage={onRewordMessage}
          showToast={showToast}
        />
      ) : null}
    </div>
  )
}

// Kept here for the tests that reset it through the panel's own module.
export { __resetSelfEmailCache } from './shared'
