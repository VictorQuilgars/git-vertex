// The classification of the desktop `window.gitAPI` surface, shared by the two
// guards that read it:
//
//   hostParity.test.ts   — every preload method is implemented or classified.
//   panelSurface.test.ts — nothing the VS Code panel can reach is unimplemented.
//
// They ask opposite questions and both need these lists, so the lists live here
// rather than in either test.
//
// Anything in EITHER list answers `{ success: false, error: 'not-implemented' }`
// in the panel. The difference is intent, not behaviour: DESKTOP_ONLY is a
// decision, KNOWN_GAPS is a debt.

/**
 * Desktop-only by design — the extension has no equivalent surface, or VS Code
 * already provides one. Nothing here is a bug; it is a decision.
 */
export const DESKTOP_ONLY = new Set([
  // App shell: the extension lives inside VS Code's window and updater.
  'zoomGet', 'zoomSet', 'isFullscreen',
  'checkForUpdates', 'downloadUpdate', 'installUpdate', 'installManual',
  'getUpdaterState', 'openDownloadedUpdate',
  'getWhatsNew', 'getReleaseNotes', 'markWhatsNewSeen',
  // Repo management: the extension is mono-repo, driven by the workspace
  // folder, so opening/cloning/scanning repos is not its job.
  'openRepo', 'setRepo', 'initRepo', 'initAdvanced', 'cloneTo', 'githubClone',
  'getRecentRepos', 'removeRecentRepo', 'scanLocalRepos', 'readReadme',
  'getWorkspaces', 'setRepoWorkspace', 'openPathInEditor',
  'listGitignoreTemplates', 'listLicenses', 'githubCreateRepo',
  // Deep links need a registered URL scheme — desktop only.
  'getPendingDeepLink',
  // AI credentials: the extension reads its own gitVertex.ai* settings.
  'aiGetApiKey', 'aiSetApiKey', 'aiListModels',
  // The git-too-old notice is raised host-side at activation
  // (notifyIfGitTooOld), so the panel never has to ask. Same for resolving
  // which git binary to run: the extension inherits VS Code's environment,
  // which already has the user's real PATH — the Finder-launch problem that
  // src/main/git-binary.ts exists for cannot happen here.
  'getGitCapabilities', 'resolveGitBinary',
  // Gitflow is reached only from GitflowModal, which the desktop App mounts and
  // the panel never imports — panelSurface.test.ts walks the bundle, so that
  // stays true or it fails. Moved here from KNOWN_GAPS: a method the panel
  // cannot reach is a decision, not a debt owed to a future lot.
  'gitflowStatus', 'gitflowInit', 'gitflowStart', 'gitflowFinish',
])

/**
 * Known gaps: the shared UI offers these in the panel and they answer
 * not-implemented. Each is claimed by a planned lot — this list must shrink,
 * never grow. See docs-private/gitvertex-plan-versions.md.
 */
// Typed explicitly: an empty literal would infer Set<never>, and every
// `.has(someString)` against it would stop compiling.
export const KNOWN_GAPS = new Set<string>([
  // Empty, and that is the point: every method the shared renderer can call is
  // now either implemented in the host or a stated DESKTOP_ONLY decision. The
  // list stays here because it is the honest place for the next debt to land —
  // an empty set is a state, not a reason to delete the concept.
  //
  // What left it, in order:
  //   githubCreatePR, githubListBranches, getDefaultBranch — the host-parity
  //     lot that made the "open a pull request" row do something.
  //   githubGetIssue — the dead-buttons lot, which is what the `#123` hover
  //     card had been asking for.
  //   githubStartAuth, githubDisconnect, githubGetToken — the lot that put
  //     sign-in behind VS Code's own GitHub provider (src/githubAuth.ts).
  //     They were the reason the panel offered a PAT field and nothing else.
  //   githubSearchIssues, githubCloseIssue, githubListRepos,
  //     githubDetectRepoAt, githubSharePatch, githubShareWipPatch — this lot.
])
