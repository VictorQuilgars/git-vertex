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
  onGithubPanel?: () => void
  githubPanelOpen?: boolean
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
  onSettings, settingsOpen, updateReady, onInstallUpdate,
  onGithubPanel, githubPanelOpen
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
      {isMac && <div className="tb-mac-spacer" />}

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

      <button className="tb-btn tb-icon-only" onClick={onRefresh} disabled={disabled}
        title={t('toolbar.refresh.tooltip')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ animation: loading ? 'tb-spin 0.9s linear infinite' : 'none' }}>
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      {lastFetchTime && (
        <span className="tb-fetch-time" title={t('toolbar.autoFetch.tooltip')}>
          ↺ {formatFetchTime(lastFetchTime)}
        </span>
      )}

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

      {onGithubPanel && repoPath && (
        <button className={`tb-btn tb-icon-only ${githubPanelOpen ? 'active' : ''}`}
          onClick={onGithubPanel} title={t('toolbar.github.tooltip')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
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
    </div>
  )
}
