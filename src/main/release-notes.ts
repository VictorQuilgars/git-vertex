// Release notes shown in the "What's new" tab the first time the app opens
// after an update (like VS Code). Keyed by version — must match package.json /
// the release tag. Keep the newest entry in sync with the top of CHANGELOG.md.
export const RELEASE_NOTES: Record<string, string> = {
  '1.16.2': `## What's new in 1.16.2

### 🌍 Internationalization cleanup
- Removed all remaining hardcoded French strings from the entire project (including the VS Code extension) and fully adopted the application's i18n system (\`useLang\`), ensuring a clean English-only default experience.
`,
  '1.16.1': `## What's new in 1.16.1

### 🇬🇧 English-only, fully applied
- The remaining French text still hardcoded across the app (Settings, sidebar, commit graph menus, conflict resolver, rebase screens, commit panel, diff viewer, and native messages) now goes through the same English-only layer introduced in 1.16.0.

### 🐛 Fixed
- Undo/redo and Gitflow merge messages now correctly show the commit subject / branch name again (an earlier cleanup had dropped it).
`,
  '1.16.0': `## What's new in 1.16.0

### 🔔 Notification center
- The **bell** in the top-right is now functional: clicking it opens a **notification panel**.
- Each notification can be **marked read/unread** or **deleted**; buttons **"Mark all as read"** and **"Clear all"**.
- A **blue badge** shows the number of **unread** notifications.
- **Available updates** automatically create a notification, kept across sessions.

### 🇬🇧 English-only app
- The app now ships in **English only**. French is disconnected, not removed — it can be re-enabled later with a one-line change.
`,
  '1.15.4': `## What's new in 1.15.4

### 🟢 Clearer "Update" button
- When an update is available, a small **"Update" button** (with a label) shows in the top-right, replacing the plain icon with a green dot. Clicking it opens the update screen.
`,
  '1.15.3': `## What's new in 1.15.3

### 🪟 Readable recent repos on Windows
- On the home screen, **recent repos** now show the **folder name** on top and the **parent path** below, like on macOS. Before, on Windows, only the full path was shown.
`,
  '1.15.2': `## What's new in 1.15.2

### 🔔 More discreet and more reliable updates
- A **discreet badge** (small green dot) appears next to the **notification bell** when an update is available — clicking it opens the update screen. No more big orange button.
- **Auto-detection** shortly after startup and then every 30 minutes.
- From Settings, "Check for updates" opens the screen on top: **"Later" returns to Settings** (instead of the home screen).
`,
  '1.15.0': `## What's new in 1.15.0

### ✨ Animated launch splash
- At **startup** (and right after an update), a small window shows the **Git Vertex V-graph drawing itself**, then hands off to the application. The app returning after an update feels crisp.

### ⬇️ Staged update
- A clear screen: **available → downloading (with real percentage) → installing**.
- The **download starts on your click**, so you really see its progress; the installing phase tells you the app **restarts in a moment**.
- "Check for updates" in Settings now opens the same screen.
`,
  '1.14.2': `## What's new in 1.14.2

### 🐛 Fixes
- **Windows**: the app name finally reads **"Git Vertex"** in the title bar, taskbar and Alt-Tab (instead of "Git GUI").
- **Commit graph**: the dashed **WIP** line (working changes) no longer **cuts through** another branch's commit — it now sits **offset** on its own lane and only joins its branch at the bottom.
- No more **MaxListeners** warning in the console: internal subscriptions (deep-link, updates, GitHub connection) no longer pile up.
`,
  '1.14.1': `## What's new in 1.14.1

### 🐛 Windows fixes
- No more **setup wizard** reappearing on every update: the update now applies **silently** then relaunches the app.
- The **Git Vertex icon** shows again in the taskbar and title bar.

### 🧭 Commit graph
- The **+/−** column is no longer **clipped** by the window's right edge: all columns fit by default, scrollbar included.
`,
  '1.14.0': `## What's new in 1.14.0

### 🚀 New home screen
- A redesigned **home page** in two columns: on the left **Open / Clone / Create** a repository, a **search** and your **recents**; on the right a **Resources** panel (Release notes, Source code, Documentation).
- New: **Create** a repository button (\`git init\`).
- The home is a **tab** you can keep open; opening a repository closes it, opening the release notes keeps it open.

### 📝 Release notes
- Available **anytime** from *Resources › Release notes*, with an **Open in browser** link.
`,
  '1.13.0': `## What's new in 1.13.0

### 🖱️ Redesigned graph menus
- **Right-clicking a branch = right-clicking its tip commit**: the same full menu (merge/rebase/rename/delete… + the commit actions). A commit that carries no branch keeps its commit menu.
- **More compact menu**: *Reset*, *Copy* and *Move* are now **submenus** that open on hover.
- **Clearer drag-and-drop**: dragging a branch A onto a branch B offers *"Merge A into B"* / *"Rebase A onto B"* with the **real names** (no more SHA), in the right direction.
- The branch chip in the graph finally offers **Merge / Rebase** (they were missing).
`,
  '1.12.0': `## What's new in 1.12.0

### 🆕 What's new after each update
This very tab: on the first open after an update, Git Vertex shows you what's new — like VS Code does.

### ⚙️ Settings reachable from the home
The **Settings** and **profile** buttons are now available on the home screen, without having to open a repository first.

### ⚠️ Warn before a conflict *(since 1.11)*
Before a **merge, rebase, cherry-pick, revert or pull** (and branch drag-and-drop on the graph), Git Vertex predicts whether the operation will create a conflict — a dry run via \`git merge-tree\`, **nothing is written to disk** — and warns you, with the choice to continue or cancel. **Rebase** is simulated commit by commit. Configurable in *Settings › Behavior*.
`,
}
