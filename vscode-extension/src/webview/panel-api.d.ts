/**
 * What the PANEL's `window.gitAPI` answers that the desktop preload does not.
 *
 * The two products do not expose the same bridge. `src/renderer/src/types.ts`
 * declares the desktop preload's surface and is held exactly equal to it by
 * preload-mirror.test.ts — a declaration with no preload behind it would throw
 * at its first desktop call site, so these methods cannot live there. They are
 * answered by GitVertexHost's explicit `case`s instead, and this file is where
 * the panel says so.
 *
 * It merges into the same `GitAPI` interface, which is why that one is named
 * rather than a type literal. Before this file, webview/app.tsx redeclared the
 * whole bridge as `any` — which is why nothing in the panel's own code was
 * checked by anything, and how `I is not defined` reached ext-v1.28.0 (#105).
 *
 * Required, not optional: this file is only in the EXTENSION's typecheck
 * program, and inside the panel the host answers every one of them. The
 * desktop's program never sees this declaration, so nothing there gains a
 * method its preload does not have.
 */
declare global {
  interface GitAPI {
    // ── VS Code's own dialogs, in place of window.prompt/confirm ──
    /** `showInputBox`. Undefined when dismissed. */
    uiPrompt: (message: string, value?: string) => Promise<string | undefined>
    /** A modal warning with an OK. False when dismissed. */
    uiConfirm: (message: string) => Promise<boolean>
    uiPick: (title: string, options: string[]) => Promise<string | undefined>

    /**
     * What the panel says about itself after each reload — the view's header
     * wears it (badge, branch) where the webview cannot reach. Fire and forget.
     */
    panelStatus: (status: { wip: number; branch: string }) => Promise<unknown>
    /** A commit the host wants shown: a SHA, a branch, a tag — resolved here. `quiet` = the cursor following. */
    onRevealCommit: (cb: (ref: string, quiet?: boolean) => void) => void
    offRevealCommit: (cb: (ref: string, quiet?: boolean) => void) => void
    /** The graph follows the editor's cursor, or stops; the host tells every listener. */
    followCursor: (on: boolean) => Promise<unknown>
    onFollowCursor: (cb: (on: boolean) => void) => void
    offFollowCursor: (cb: (on: boolean) => void) => void
    /** Someone outside asked for the panel's settings page. */
    onOpenSettings: (cb: () => void) => void
    offOpenSettings: (cb: () => void) => void
    /**
     * One git command, its stdout. The reflective bridge answers it from
     * GitService; the panel uses it for what has no method of its own —
     * resolving a name the user typed or clicked into a commit.
     */
    raw: (args: string[]) => Promise<string>

    /** The repositories of the workspace, one per repository root, and the one on screen. */
    listWorkspaceRepos: () => Promise<{ repos: { path: string; name: string }[]; current?: string; hasFolder?: boolean }>
    /** A command run by name — VS Code's doors, this extension's own — from an allow-list the host keeps. */
    workbench: (id: string) => Promise<unknown>
    /** Put another repository of the workspace on screen. */
    setPanelRepo: (repoPath: string) => Promise<unknown>
    /**
     * A worktree's "Open": switched to when it is a folder of the workspace,
     * opened in a new window when it is not — `here` when it is already on screen.
     */
    openWorktree: (path: string) => Promise<{ success: boolean; error?: string; opened?: 'here' | 'panel' | 'window' }>

    /** A file-history tab follows the active editor, or stops. */
    historyFollow: (on: boolean) => Promise<unknown>
    /** The file a following history tab should show now. */
    onHistoryFile: (cb: (file: string) => void) => void
    offHistoryFile: (cb: (file: string) => void) => void

    // ── Tabs the panel opens in the editor, where the desktop opens a view ──
    openCompare: (base: string, target: string | null, axis?: 'diverged' | 'endpoints') => Promise<unknown>
    openCompareWorkingTab: (hash: string) => Promise<unknown>
    /** A stash's contents — the desktop's stash view, as an editor tab. */
    openStashTab: (index: number, message: string) => Promise<unknown>
    openInteractiveRebaseTab: (hash: string) => Promise<unknown>
    openStagingEditor: (path?: string) => Promise<unknown>
    /**
     * A model's reading, in its own editor tab. The desktop shows these in a
     * drawer beside the graph; the panel is narrower than the answer, so here
     * they open the way this extension opens everything else that needs room.
     */
    openAIReadingTab: (kind: 'branch' | 'stash' | 'working' | 'changelog' | 'split', key?: string, label?: string) => Promise<unknown>
    openConflictResolver: (path: string) => Promise<unknown>
    openDiff: (target: unknown) => Promise<unknown>
    /** Hands the repository over to the desktop app, if it is installed. */
    openDesktop: () => Promise<{ success: boolean }>
    /** The gallery is a quick-pick here, not the desktop's settings page. */
    themesOpenGallery: () => Promise<unknown>
    /** Lets a focused tool close the tab it is running in. */
    closeSelf: () => Promise<unknown>

    // ── The rebase todo editor, which is a real document in this host ──
    getRebaseState: () => Promise<unknown>
    todoGet: () => Promise<{ text: string } | undefined>
    todoSave: (text: string) => Promise<{ success: boolean } | undefined>
    todoAbort: () => Promise<{ success: boolean } | undefined>
    commitMsgSave: (text: string) => Promise<unknown>

    // ── The editor's own context menus, which the desktop has no equivalent of ──
    // postCommitMenuAction always sends the hash, so it is not optional.
    onMenuAction: (handler: (action: string, hash: string) => void) => void
    offMenuAction: (handler: (action: string, hash: string) => void) => void
    setLastMenuHash: (hash: string) => void
  }
}

export {}
