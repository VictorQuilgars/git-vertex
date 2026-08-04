import React, { useRef, useState } from 'react'
import './Toolbar.css'
import { useLang } from '../../i18n/LanguageContext'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import { PullMode } from '../../types'
import { Icon } from '../Icon/Icon'

interface ToolbarProps {
  repoPath: string | null
  currentBranch: string
  searchQuery: string
  searchMatches?: number
  showAllBranches: boolean
  onSearch: (q: string) => void
  onUndo: () => void
  onRedo: () => void
  onFetch: () => void
  onPush: () => void
  onPushModal: () => void
  onPull: () => void
  pullMode: PullMode
  onSetPullMode: (mode: PullMode) => void
  onCreateBranch: () => void
  onStash?: () => void
  onPop?: () => void
  onTerminal?: () => void
  stashCount?: number
  onToggleAllBranches: () => void
  onRefresh: () => void
  loading: boolean
  lastFetchTime?: Date | null
  extendedSearch?: boolean
  extendedSearchLoading?: boolean
  onToggleExtendedSearch?: () => void
  // AI natural-language search — toggled with the ✨ button, runs on Enter.
  aiSearch?: boolean
  aiSearchLoading?: boolean
  onToggleAiSearch?: () => void
  onAiSearchSubmit?: () => void
  onSettings?: () => void
  settingsOpen?: boolean
  updateReady?: boolean
  onInstallUpdate?: () => void
  githubRepoUrl?: string | null
  onCreatePR?: () => void
  onGitflow?: () => void
  topRow?: boolean
}

// Toolbar cell: label on top, icon below.
function TBtn({ icon, label, onClick, disabled, title, accent }: {
  icon: React.ReactNode; label: string; onClick: () => void
  disabled?: boolean; title?: string; accent?: string
}) {
  return (
    <button
      className={`tb-cell ${accent ? `tb-accent-${accent}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="tb-cell-label">{label}</span>
      <span className="tb-cell-icon">{icon}</span>
    </button>
  )
}

export default function Toolbar({
  repoPath, currentBranch, showAllBranches, searchQuery, searchMatches, onSearch,
  onUndo, onRedo, onFetch, onPush, onPull, pullMode, onSetPullMode, onCreateBranch,
  onStash, onPop, onTerminal, stashCount = 0,
  onToggleAllBranches, loading,
  extendedSearch, extendedSearchLoading, onToggleExtendedSearch,
  aiSearch, aiSearchLoading, onToggleAiSearch, onAiSearchSubmit,
  updateReady, onInstallUpdate, githubRepoUrl, onCreatePR, onGitflow,
  topRow = true
}: ToolbarProps) {
  const { t } = useLang()
  const isMac = (window as any).appInfo?.platform === 'darwin'
  const disabled = !repoPath || loading
  const pullChevRef = useRef<HTMLButtonElement>(null)
  const [pullMenuPos, setPullMenuPos] = useState<{ x: number; y: number } | null>(null)

  const pullMenuItems: MenuItemDef[] = [
    { label: t('toolbar.pull.modeFetch'), checked: pullMode === 'fetch', action: () => onSetPullMode('fetch') },
    { label: t('toolbar.pull.modeFf'), checked: pullMode === 'ff', action: () => onSetPullMode('ff') },
    { label: t('toolbar.pull.modeFfOnly'), checked: pullMode === 'ff-only', action: () => onSetPullMode('ff-only') },
    { label: t('toolbar.pull.modeRebase'), checked: pullMode === 'rebase', action: () => onSetPullMode('rebase') },
  ]
  const runDefault = () => (pullMode === 'fetch' ? onFetch() : onPull())
  const defaultLabel = pullMode === 'fetch' ? 'Fetch' : 'Pull'

  return (
    <div className="toolbar">
      {isMac && topRow && <div className="tb-mac-spacer" />}

      {repoPath && (
      <>
      <div className="tb-spring" />

      {/* Centered main action group */}
      <div className="tb-group">
        <TBtn label="Undo" title={t('toolbar.undo.tooltip')} disabled={disabled} onClick={onUndo}
          icon={<Icon name="undo" size={18} />}
        />
        <TBtn label="Redo" title={t('toolbar.redo.tooltip')} disabled={disabled} onClick={onRedo}
          icon={<Icon name="redo" size={18} />}
        />

        <div className="tb-group-sep" />

        {/* Pull — split: main button runs the selected default (fetch or one
            of the pull strategies), chevron opens the mode picker. */}
        <div className={`tb-cell tb-cell-split ${disabled ? 'tb-cell-disabled' : ''}`}>
          <span className="tb-cell-label">{defaultLabel}</span>
          <div className="tb-cell-split-row">
            <button className="tb-split-icon" disabled={disabled} onClick={runDefault} title={t('toolbar.pull.tooltip')}>
              <Icon name="download" size={18} />
            </button>
            <button ref={pullChevRef} className="tb-split-chev" disabled={disabled} title={t('toolbar.pull.menuTitle')}
              onClick={() => {
                const r = pullChevRef.current?.getBoundingClientRect()
                if (r) setPullMenuPos({ x: r.left, y: r.bottom + 4 })
              }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"/></svg>
            </button>
          </div>
          {pullMenuPos && (
            <ContextMenu x={pullMenuPos.x} y={pullMenuPos.y} items={pullMenuItems} onClose={() => setPullMenuPos(null)} />
          )}
        </div>

        <TBtn label="Push" title={t('toolbar.push.tooltip')} disabled={disabled} onClick={onPush} accent="green"
          icon={<Icon name="push" size={18} />}
        />

        <div className="tb-group-sep" />

        <TBtn label="Branch" title={t('toolbar.newBranch.tooltip')} disabled={disabled} onClick={onCreateBranch}
          icon={<Icon name="newBranch" size={18} />}
        />
        <TBtn label="Stash" title={t('toolbar.stash.tooltip')} disabled={disabled} onClick={() => onStash?.()}
          icon={<Icon name="stash" size={18} />}
        />
        <TBtn label="Pop" title={t('toolbar.pop.tooltip')} disabled={disabled || stashCount === 0} onClick={() => onPop?.()}
          icon={<Icon name="pop" size={18} />}
        />

        {onGitflow && (
          <TBtn label="Gitflow" title={t('toolbar.gitflow.tooltip')} disabled={disabled} onClick={onGitflow}
            icon={<Icon name="gitflow" size={18} />}
          />
        )}

        <div className="tb-group-sep" />

        <TBtn label="Terminal" title={t('toolbar.terminal.tooltip')} disabled={!repoPath} onClick={() => onTerminal?.()}
          icon={<Icon name="terminal" size={18} />}
        />
      </div>

      <div className="tb-spring" />

      {/* Secondary right cluster */}
      <div className="tb-right">
        {githubRepoUrl && currentBranch && !['main', 'master'].includes(currentBranch) && onCreatePR && (
          <button className="tb-btn tb-accent-blue" disabled={disabled} onClick={onCreatePR}
            title={t('toolbar.createPR.tooltip')}>
            <Icon name="pullRequest" size={14} />
            <span>PR</span>
          </button>
        )}
        <button className={`tb-btn tb-toggle ${showAllBranches ? 'active' : ''}`}
          onClick={onToggleAllBranches} disabled={disabled} title={t('toolbar.allBranches.tooltip')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM5 3.25a.75.75 0 1 0 0 .005V3.25z"/>
          </svg>
        </button>
        <div className={`tb-search${aiSearch ? ' tb-search--ai' : ''}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text"
            placeholder={aiSearch ? t('toolbar.aiSearch.placeholder') : t('toolbar.search.placeholder')}
            value={searchQuery} onChange={e => onSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && aiSearch && !aiSearchLoading) onAiSearchSubmit?.() }} />
          {searchQuery && searchMatches != null && searchMatches >= 0 && (
            <span className={`tb-search-count${searchMatches === 0 ? ' tb-search-count--none' : ''}`}>
              {searchMatches}
            </span>
          )}
          {searchQuery && <button className="tb-clear" title={t('common.clearSearch')} onClick={() => onSearch('')}>×</button>}
          {onToggleExtendedSearch && (
            <button className={`tb-ext-search ${extendedSearch ? 'active' : ''}`}
              onClick={onToggleExtendedSearch} title={t('toolbar.extSearch.tooltip')}>
              {extendedSearchLoading ? '…' : (
                /* code chevrons: search inside diffs/code, not just messages */
                <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                  <path d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L13.94 8l-3.72-3.72a.75.75 0 1 1 1.06-1.06ZM4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06Z"/>
                </svg>
              )}
            </button>
          )}
          {onToggleAiSearch && (
            <button className={`tb-ext-search tb-ai-search ${aiSearch ? 'active' : ''}`}
              onClick={onToggleAiSearch} title={t('toolbar.aiSearch.tooltip')}>
              {aiSearchLoading ? '…' : '✨'}
            </button>
          )}
        </div>
      </div>
      </>
      )}

      {!repoPath && <div className="tb-spring" />}
      {/* The update affordance now lives as a discreet badge next to the
          notification bell in the top bar (App.tsx), not here. */}
    </div>
  )
}
