# Changelog — Git Vertex (desktop)

## 1.21.0

### Added
- **Branch strip inside the changes panel** — the branch name, publish, fetch and the branch menu now sit directly above the file list, instead of living only in the toolbar, out of sight while you work in the staging area.
- **Per-file line counts** — every changed file shows its own `+N −M`, from `git diff --numstat`. Untracked and binary files stay without counters, since git reports none for them.
- **"N staged" badge** in the files header, alongside the total change count.
- **Stash** and **Discard all** reachable from the staging header — Discard all previously sat in the topbar, which the compact layout hides exactly when room is short.
- **Copy the list of changed files**.
- **Open changes** on a file row — a direct diff, next to the existing hunk editor.
- **Associate an issue** is now offered inline under the branch strip when none is linked, instead of being buried in the menu.

## 1.20.0

### Added
- **Unified branch menu** — every branch action (checkout, fetch, pull, push, upstream, rebase onto, compare, rename, delete, solo/mute…) now lives in one menu, reachable both from a **⋮** button on hover and from right-click, in the sidebar and next to the toolbar's branch selector. These actions used to be scattered across three separate places.
- **Open branch on remote** — jump straight to the branch page on GitHub; previously only possible from a commit.
- **Favorite branches** — star the ones you visit often and they float to the top of the LOCAL list.
- **Associate an issue with a branch** — link a GitHub issue to a branch; its number then shows as a badge next to it.
- **Filter the staging file list** — a search box over the changed files, in both list and tree view. It is a display lens only: counters, the master checkbox and staging actions still act on the full set.

## 1.19.0

### Added
- **Settings: General, External Tools, SSH** — new Behavior options (default branch name, auto-fetch interval, auto-update-submodules); dedicated external diff/merge/terminal tool settings; SSH key management wired to `core.sshCommand`.

### Changed
- Sober line icons replace colored emoji in the Settings navigation.

### Fixed
- A Settings navigation label collision (two items both named "General").
- The default branch name wasn't applied when the Init modal opened before settings finished loading.

## 1.18.2

### Changed
- Removed the **Environment** block (Electron / Node.js / Chrome versions) from Settings → About.

## 1.18.1

### Changed
- **Commit message is a single free-form field** — no more separate summary/description inputs; write your message with your own line breaks, same as `git commit` itself. The conventional-commit type picker and character counter were removed to give the field more room.
- **Amend previous commit** now shares its row with **Generate with AI**.
- The commit-form resize handle is no longer capped by short window sizes.

## 1.18.0

### Added
- **Repository Management** hub (folder button → full-page overlay): Open / Favorites / Recent sections with search and a WIP-summary toggle; per-row open, favorite, open-in-external-editor, repository details (README slide-in) and remove; a New Workspace modal.
- **another tool-style Clone modal**: provider nav (Clone with URL / GitHub.com), Where-to-clone field with Browse, searchable remote-repo list, Shallow Clone and Sparse Checkout options (clones to the chosen location).
- **another tool-style Init modal**: Local Only (name, location, branch, optional .gitignore + license, LFS) and GitHub.com (create the remote repo + clone).

### Fixed
- Tabs stick to the left in macOS fullscreen (the traffic-light spacer is dropped when fullscreen).

## 1.17.0

### Added
- **Full-page Launchpad** (rocket button in the tab bar): a user-centric feed of your open PRs and issues across all your GitHub repos, with **My Pull Requests / My Issues / WIPs / All / Snoozed** tabs, search, workspace and label filters, and always-visible counts.
- **WIPs**: scans local repos for uncommitted work (files changed, +/− lines) with a **View Repo** action and **Create cloud patch** (secret gist of the working diff).
- Row actions: View Repo (opens the local tab when cloned), Open on GitHub, Copy link, **Mark as closed**.
- **Pin** and **snooze** items (free), persisted locally; snoozed items collect under the Snoozed tab.
- **Multiple Home tabs** — every **+** opens a fresh Home.
- **Named workspaces** over recent repos (managed from the Launchpad) and **Share a commit's patch** as a secret-gist link (recovered features).

### Fixed
- Patch sharing now requests the GitHub **gist** scope (reconnect to grant it); clearer error when the scope is missing.
- The Launchpad no longer silently shows 0 items on a GitHub search rate-limit — it surfaces the limit with a retry, and caches results to avoid hitting it.

## 1.16.2

### Changed
- **Internationalization (i18n) cleanup** — Removed all remaining hardcoded French strings from the entire project (including the VS Code extension) and fully adopted the application's i18n system (`useLang`), ensuring a clean English-only default experience.

## 1.16.1
- **English-only, fully applied** — the remaining French text that was still hardcoded across the app (Settings, sidebar, commit graph menus, conflict resolver, rebase screens, commit panel, diff viewer, and native error/notification messages) now goes through the same English-only translation layer introduced in 1.16.0. French is still only disconnected, not removed, and can be re-enabled with a one-line change.

### Fixed
- **Undo/redo and Gitflow merge messages were missing their commit subject / branch name** — an earlier internal cleanup accidentally dropped the interpolated value, so "Undo" and "Redo" toasts showed an empty subject and a Gitflow merge conflict message omitted the branch name. Caught by the existing test suite before release.

## 1.16.0

### Added
- **Notification center** — the top-right bell is now functional: clicking it opens a panel listing notifications. Each entry can be marked read/unread or deleted, with "Mark all as read" and "Clear all". A blue badge shows the number of unread notifications. Available updates automatically create a notification (persisted across sessions).

### Changed
- **English-only app** — the app now ships in English only. French is disconnected, not removed: the full French translations stay in the code and can be re-enabled with a one-line change.

## 1.15.4

### Changed
- **Explicit "Update" button** — when an update is available, a small green "Update" button (with a label) appears in the top-right, replacing the plain icon with a green dot. Clicking it opens the update screen, as before.

## 1.15.3

### Fixed
- **Recent repos on Windows** — the home screen now shows the folder name on top and the parent path below, like on macOS. Previously, on Windows (paths using `\`), only the full path was shown, without the folder name.

## 1.15.2

### Changed
- **Discreet update badge** — when an update is available, a small badge (with a green dot) appears next to the notification bell, top-right. Clicking it opens the update screen. No more big orange button in the toolbar.
- **More reliable auto-detection** — the app checks for updates shortly after startup and then every 30 minutes, so a version published while the app is open is picked up without restarting.

### Fixed
- From Settings, "Check for updates" no longer ejects to the home screen: the update screen opens on top, and "Later" returns to Settings.

## 1.15.0

### Added
- **Animated launch splash** — at startup (and right after an update), a small window shows the Git Vertex V-graph drawing itself before handing off to the application. The app returning after an update feels crisp rather than "empty".
- **Staged update with a real progress bar** — the flow now goes through a clear screen: *available → downloading (with real percentage) → installing*. The download starts on your click (so its progress is visible), and the installing phase honestly indicates the app will restart in a moment.

### Changed
- One single update flow: "Check for updates" in Settings opens the same screen as the banner, instead of a separate progress display.

## 1.14.2

### Fixed
- **Windows: the app name now reads "Git Vertex"** in the title bar, taskbar tooltip and Alt-Tab (the window title was still "Git GUI").
- **Commit graph: the WIP (working-changes) dashed line no longer cuts through another branch's commit** — when the current branch is one commit behind `master`, the WIP node now sits on its own offset lane and only hooks into its branch tip at the bottom.
- **No more `MaxListenersExceededWarning`** — deep-link, updater and GitHub-auth IPC listeners were piling up (notably one per Settings open); subscriptions now return an unsubscribe function that the UI cleans up.

## 1.14.1

### Fixed
- **Windows: the setup wizard no longer reappears on every update** — the NSIS updater now applies the update silently and relaunches the app.
- **Windows: the Git Vertex icon now shows** in the taskbar and title bar — a proper multi-resolution `.ico` is bundled and used as the window icon (an `.icns` is not valid on Windows). The About-screen logo also resolves in packaged builds.
- **The +/− (stats) column is no longer clipped by the window's right edge** (Windows/Linux) — columns are now sized against the width left by the vertical scrollbar, so every column fits by default and the header stays aligned with the rows.

## 1.14.0

### Added
- **Redesigned launchpad (welcome screen)** — a two-column home with a vertical divider: Open / Clone / **Create** (git init), a repository search box, and the recent list (capped, no scroll); plus a **Resources** panel (Release notes, Source code, Documentation).
- **Release notes on demand** — open the (another tool-style) release notes anytime from Resources, with an "Open in browser" link.

### Changed
- The home is a named, non-permanent tab (🏠): opening a repository from it closes it; opening a non-repo view (release notes) keeps it, before it in the tab bar (opening order). The repo sidebar and activity bar are hidden on the home.

## 1.13.1

### Fixed
- The "What's new" release-notes view is now a normal, non-blocking tab: you can open a repository without closing it, keep it in the background, and close it by its × (no more "C'est parti" button, and the repo's sidebar/toolbar are no longer reachable behind it).

## 1.13.0

### Changed
- **Unified graph context menu** — right-clicking a local branch chip now opens the same menu as its tip commit (branch actions + commit actions), matching another tool; a non-tip commit keeps the commit-only menu.
- **Shorter menu with submenus** — Reset (soft/mixed/hard), Copy (hashes/message) and Move (up/down) are now hover submenus.
- **Clearer branch drag-drop** — dragging branch A onto branch B offers "Merge A into B" / "Rebase A onto B" with real branch names (not the target SHA), in the expected direction; no menu when dragging the checked-out branch.

### Fixed
- The branch chip in the graph now offers Merge/Rebase (they were missing; only the sidebar had them).

## 1.12.0

### Added
- **"What's new" tab** — the first time the app opens after an update, a tab shows the release notes (like VS Code).
- **Settings / profile from the welcome screen** — the settings and profile buttons are now reachable before opening a repository.

## 1.11.0

### Added
- **Conflict warning before an operation** — before a merge, rebase, cherry-pick, revert or pull (and the graph's drag-drop merge/rebase), Git Vertex predicts whether the operation will conflict (a dry run via `git merge-tree`, nothing written to disk) and warns you, with the choice to continue or cancel. Rebase prediction simulates the replay commit by commit, so it catches conflicts a naive tip-merge would miss. A **"Warn before a conflict"** toggle in Settings › Behavior (on by default) controls it, with a "don't ask again" shortcut on the warning.
