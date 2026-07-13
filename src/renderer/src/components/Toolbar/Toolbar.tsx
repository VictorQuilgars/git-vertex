import React from 'react'
import './Toolbar.css'
import { useLang } from '../../i18n/LanguageContext'

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
  onUndo, onRedo, onFetch, onPush, onPull, onCreateBranch,
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

  return (
    <div className="toolbar">
      {isMac && topRow && <div className="tb-mac-spacer" />}

      {repoPath && (
      <>
      <div className="tb-spring" />

      {/* Centered main action group */}
      <div className="tb-group">
        <TBtn label="Undo" title={t('toolbar.undo.tooltip')} disabled={disabled} onClick={onUndo}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>}
        />
        <TBtn label="Redo" title={t('toolbar.redo.tooltip')} disabled={disabled} onClick={onRedo}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>}
        />

        <div className="tb-group-sep" />

        {/* Pull — split: main pulls, chevron fetches */}
        <div className={`tb-cell tb-cell-split ${disabled ? 'tb-cell-disabled' : ''}`}>
          <span className="tb-cell-label">Pull</span>
          <div className="tb-cell-split-row">
            <button className="tb-split-icon" disabled={disabled} onClick={onPull} title={t('toolbar.pull.tooltip')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/></svg>
            </button>
            <button className="tb-split-chev" disabled={disabled} onClick={onFetch} title={t('toolbar.fetch.tooltip')}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z"/></svg>
            </button>
          </div>
        </div>

        <TBtn label="Push" title={t('toolbar.push.tooltip')} disabled={disabled} onClick={onPush} accent="green"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="21" x2="12" y2="9"/><polyline points="7 14 12 9 17 14"/></svg>}
        />

        <div className="tb-group-sep" />

        <TBtn label="Branch" title={t('toolbar.newBranch.tooltip')} disabled={disabled} onClick={onCreateBranch}
          icon={<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/></svg>}
        />
        <TBtn label="Stash" title={t('toolbar.stash.tooltip')} disabled={disabled} onClick={() => onStash?.()}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>}
        />
        <TBtn label="Pop" title={t('toolbar.pop.tooltip')} disabled={disabled || stashCount === 0} onClick={() => onPop?.()}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v8"/><polyline points="8 8 12 4 16 8"/><path d="M22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6"/></svg>}
        />

        {onGitflow && (
          <TBtn label="Gitflow" title={t('toolbar.gitflow.tooltip')} disabled={disabled} onClick={onGitflow}
            icon={<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v5.256a2.25 2.25 0 1 0 1.5 0V5.372zM5 13.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm6.75-3.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm0-2.122a2.25 2.25 0 1 1-1.5 0V5a1 1 0 0 0-1-1H6.5a.75.75 0 0 1 0-1.5h2.75a2.5 2.5 0 0 1 2.5 2.5v2.878z"/></svg>}
          />
        )}

        <div className="tb-group-sep" />

        <TBtn label="Terminal" title={t('toolbar.terminal.tooltip')} disabled={!repoPath} onClick={() => onTerminal?.()}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>}
        />
      </div>

      <div className="tb-spring" />

      {/* Secondary right cluster */}
      <div className="tb-right">
        {githubRepoUrl && currentBranch && !['main', 'master'].includes(currentBranch) && onCreatePR && (
          <button className="tb-btn tb-accent-blue" disabled={disabled} onClick={onCreatePR}
            title={t('toolbar.createPR.tooltip')}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/></svg>
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
          {searchQuery && <button className="tb-clear" onClick={() => onSearch('')}>×</button>}
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

      {updateReady && (
        <button className="tb-btn tb-update-btn" onClick={onInstallUpdate} title={t('toolbar.update.tooltip')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>{t('toolbar.update.label')}</span>
        </button>
      )}
    </div>
  )
}
