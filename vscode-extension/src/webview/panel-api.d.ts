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

    // ── Tabs the panel opens in the editor, where the desktop opens a view ──
    openCompare: (base: string, target: string) => Promise<unknown>
    openCompareWorkingTab: (hash: string) => Promise<unknown>
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
