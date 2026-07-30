import React from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { SettingsProvider } from '../contexts/SettingsContext'
import { LanguageProvider } from '../i18n/LanguageContext'

// A jest.fn()-based stand-in for the preload's window.gitAPI, covering every
// method the components under test call. Individual tests override specific
// methods with .mockResolvedValueOnce(...)/.mockImplementation(...) as needed.
export function createMockGitAPI(overrides: Record<string, any> = {}) {
  const base = {
    // Settings
    settingsGetAll: jest.fn().mockResolvedValue({}),
    settingsSet: jest.fn().mockResolvedValue({ success: true }),
    gitGetGlobalConfig: jest.fn().mockResolvedValue({ userName: '', userEmail: '' }),
    gitSetGlobalConfig: jest.fn().mockResolvedValue({ success: true }),
    // Which git the app runs — Settings → Git shows the version AND the path,
    // because a machine with two gits makes the version alone ambiguous.
    getGitCapabilities: jest.fn().mockResolvedValue({
      version: '2.50.0', path: '/opt/homebrew/bin/git', source: 'login-shell', conflictPrediction: true,
    }),
    resolveGitBinary: jest.fn().mockResolvedValue({
      version: '2.50.0', path: '/opt/homebrew/bin/git', source: 'login-shell',
    }),
    appGetInfo: jest.fn().mockResolvedValue({ version: '0.0.0', electron: '', node: '', chrome: '' }),
    checkForUpdates: jest.fn().mockResolvedValue({ dev: true }),
    installManual: jest.fn().mockResolvedValue({ success: true }),
    installUpdate: jest.fn().mockResolvedValue(undefined),
    getUpdaterState: jest.fn().mockResolvedValue({}),
    onUpdateDownloaded: jest.fn(() => () => {}),
    onDownloadProgress: jest.fn(() => () => {}),
    onUpdateError: jest.fn(() => () => {}),
    // GitHub
    githubGetUser: jest.fn().mockResolvedValue({ user: null }),
    githubStartAuth: jest.fn().mockResolvedValue(undefined),
    githubDisconnect: jest.fn().mockResolvedValue(undefined),
    onGithubAuthComplete: jest.fn(() => () => {}),
    githubCreateRepo: jest.fn().mockResolvedValue({}),
    listGitignoreTemplates: jest.fn().mockResolvedValue({ templates: [] }),
    listLicenses: jest.fn().mockResolvedValue({ licenses: [] }),
    // AI
    aiListProviderModels: jest.fn().mockResolvedValue({ models: [] }),
    aiResolveConflict: jest.fn().mockResolvedValue({ resolution: '' }),
    // Init
    initAdvanced: jest.fn().mockResolvedValue({ path: '/tmp/repo' }),
    selectDirectory: jest.fn().mockResolvedValue({ path: null }),
    // SSH / external tools (v1.20.0)
    sshBrowseKey: jest.fn().mockResolvedValue({ path: null }),
    sshGenerateKey: jest.fn().mockResolvedValue({ privateKey: '', publicKey: '' }),
    openExternalMerge: jest.fn().mockResolvedValue({ success: true, mergedPath: '/tmp/merged' }),
    openExternalDiff: jest.fn().mockResolvedValue({ success: true }),
    readTempFile: jest.fn().mockResolvedValue({ content: '' }),
    openInEditor: jest.fn().mockResolvedValue({ success: true }),
    // Conflict resolver
    getConflictSides: jest.fn().mockResolvedValue({ ours: '', theirs: '' }),
    getConflictVersions: jest.fn().mockResolvedValue({ base: '', ours: '', theirs: '' }),
    getFileContent: jest.fn().mockResolvedValue({ content: '' }),
    resolveConflict: jest.fn().mockResolvedValue({ success: true }),
    onRepoChanged: jest.fn(),
    onWorkingChanged: jest.fn(),
    offRepoChanged: jest.fn(),
    offWorkingChanged: jest.fn(),
    // Diff viewing
    getDiff: jest.fn().mockResolvedValue({ diff: '' }),
    getWorkingFileDiff: jest.fn().mockResolvedValue({ diff: '' }),
    getFileAtCommit: jest.fn().mockResolvedValue({ content: '' }),
    applyPatch: jest.fn().mockResolvedValue({ success: true }),
  }
  return { ...base, ...overrides }
}

export function installMockGitAPI(overrides: Record<string, any> = {}) {
  const api = createMockGitAPI(overrides)
  ;(window as any).gitAPI = api
  ;(window as any).appInfo = { platform: 'darwin' }
  return api
}

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(
    <LanguageProvider>
      <SettingsProvider>{ui}</SettingsProvider>
    </LanguageProvider>,
    options
  )
}
