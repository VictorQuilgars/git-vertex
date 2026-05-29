import React from 'react'
import './Toolbar.css'
import { useLang } from '../../i18n/LanguageContext'

interface ToolbarProps {
  repoPath: string | null
  currentBranch: string
  searchQuery: string
  showAllBranches: boolean
  onSearch: (q: string) => void
  onFetch: () => void
  onPush: () => void
  onPushModal: () => void
  onPull: () => void
  onCreateBranch: () => void
  onToggleAllBranches: () => void
  onRefresh: () => void
  loading: boolean
  lastFetchTime?: Date | null
  extendedSearch?: boolean
  extendedSearchLoading?: boolean
  onToggleExtendedSearch?: () => void
  onSettings?: () => void
  settingsOpen?: boolean
  updateReady?: boolean
  onInstallUpdate?: () => void
  githubRepoUrl?: string | null
  onCreatePR?: () => void
  onGitflow?: () => void
  topRow?: boolean
}

function TBtn({ icon, label, onClick, disabled, title, accent }: {
  icon: React.ReactNode; label?: string; onClick: () => void
  disabled?: boolean; title?: string; accent?: string
}) {
  return (
    <button
      className={`tb-btn ${accent ? `tb-accent-${accent}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  )
}

export default function Toolbar({
  repoPath, currentBranch, searchQuery, showAllBranches,
  onSearch, onFetch, onPush, onPushModal, onPull, onCreateBranch,
  onToggleAllBranches, onRefresh, loading, lastFetchTime,
  extendedSearch, extendedSearchLoading, onToggleExtendedSearch,
  onSettings, settingsOpen, updateReady, onInstallUpdate, githubRepoUrl, onCreatePR, onGitflow,
  topRow = true
}: ToolbarProps) {
  const { t } = useLang()
  const isMac = (window as any).appInfo?.platform === 'darwin'
  const disabled = !repoPath || loading

  const formatFetchTime = (date: Date): string => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diff < 60) return t('toolbar.fetchedNow')
    return t('toolbar.fetchedAgo', Math.floor(diff / 60))
  }

  return (
    <div className="toolbar">
      {isMac && topRow && <div className="tb-mac-spacer" />}

      {repoPath && (
      <>
      {currentBranch && (
        <div className="tb-branch-pill">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
          </svg>
          {currentBranch}
        </div>
      )}

      <div className="tb-divider" />

      <TBtn title={t('toolbar.fetch.tooltip')} disabled={disabled} onClick={onFetch}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
        label="Fetch"
      />

      <TBtn title={t('toolbar.pull.tooltip')} disabled={disabled} onClick={onPull}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/><path d="M3 12a9 9 0 0 0 9 9"/></svg>}
        label="Pull"
      />

      {/* Push — split button */}
      <div className={`tb-split${disabled ? ' tb-split-disabled' : ''}`}>
        <button className="tb-split-main tb-accent-green" disabled={disabled} onClick={onPush}
          title={t('toolbar.push.tooltip')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 7 21 12 16 17"/><line x1="21" y1="12" x2="9" y2="12"/><path d="M3 12a9 9 0 0 1 9-9"/>
          </svg>
          <span>Push</span>
        </button>
        <button className="tb-split-arrow tb-accent-green" disabled={disabled} onClick={onPushModal}
          title={t('toolbar.pushModal.tooltip')}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M1 3l4 4 4-4"/></svg>
        </button>
      </div>

      {githubRepoUrl && currentBranch && !['main', 'master'].includes(currentBranch) && onCreatePR && (
        <TBtn
          title={t('toolbar.createPR.tooltip')}
          disabled={disabled}
          onClick={onCreatePR}
          icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/></svg>}
          label="Pull Request"
          accent="blue"
        />
      )}

      <div className="tb-divider" />

      <TBtn title={t('toolbar.newBranch.tooltip')} disabled={disabled} onClick={onCreateBranch}
        icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/></svg>}
        label="Branch"
      />

      <button className={`tb-btn tb-toggle ${showAllBranches ? 'active' : ''}`}
        onClick={onToggleAllBranches} disabled={disabled} title={t('toolbar.allBranches.tooltip')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218zM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5zM5 3.25a.75.75 0 1 0 0 .005V3.25z"/>
        </svg>
        <span>All Branches</span>
      </button>

      {onGitflow && (
        <TBtn title={t('toolbar.gitflow.tooltip')} disabled={disabled} onClick={onGitflow}
          icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v5.256a2.25 2.25 0 1 0 1.5 0V5.372zM5 13.5a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm6.75-3.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm0-2.122a2.25 2.25 0 1 1-1.5 0V5a1 1 0 0 0-1-1H6.5a.75.75 0 0 1 0-1.5h2.75a2.5 2.5 0 0 1 2.5 2.5v2.878z"/></svg>}
          label="Gitflow"
        />
      )}

      <button className="tb-btn tb-icon-only" onClick={onRefresh} disabled={disabled}
        title={t('toolbar.refresh.tooltip')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ animation: loading ? 'tb-spin 0.9s linear infinite' : 'none' }}>
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>

      {lastFetchTime && (
        <span className="tb-fetch-time" title={t('toolbar.autoFetch.tooltip')}>
          ↺ {formatFetchTime(lastFetchTime)}
        </span>
      )}
      </>
      )}

      <div style={{ flex: 1 }} />

      {updateReady && (
        <button className="tb-btn tb-update-btn" onClick={onInstallUpdate}
          title={t('toolbar.update.tooltip')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>{t('toolbar.update.label')}</span>
        </button>
      )}

      {onSettings && (
        <button className={`tb-btn tb-icon-only ${settingsOpen ? 'active' : ''}`}
          onClick={onSettings} title={t('toolbar.settings.tooltip')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      )}

      {repoPath && (
        <div className="tb-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder={t('toolbar.search.placeholder')}
            value={searchQuery} onChange={e => onSearch(e.target.value)} />
          {searchQuery && <button className="tb-clear" onClick={() => onSearch('')}>×</button>}
          {onToggleExtendedSearch && (
            <button className={`tb-ext-search ${extendedSearch ? 'active' : ''}`}
              onClick={onToggleExtendedSearch} title={t('toolbar.extSearch.tooltip')}>
              {extendedSearchLoading ? '…' : 'Ext'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
