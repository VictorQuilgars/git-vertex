// Release notes shown in the "What's new" tab the first time the panel opens
// after the extension updates. The twin of the desktop's src/main/release-notes.ts,
// keyed the same way — by version, matching package.json and the ext-v* tag.
//
// Why the extension needs its own, when VS Code already shows a changelog: the
// difference is not the surface, it is the gesture. The desktop PUSHES its notes
// on the first launch after an update; VS Code waits for you to go looking. So
// everything shipped here landed in silence — a whole lot could make things
// start working and nobody would find out.
//
// Backfilled with every version in CHANGELOG.md rather than starting from today,
// so the on-demand view has a history instead of one lonely entry. The older
// notes are condensed: they exist to be browsed, not read end to end.
//
// Keep the newest entry in sync with the top of CHANGELOG.md — releaseNotes.test.ts
// fails if one file carries an Unreleased section and the other does not.

export const RELEASE_NOTES: Record<string, string> = {
  'Unreleased': `## What's new in Unreleased

### 🧺 The staging pane, top to bottom
- A header that names the pane and counts what is in it, with **Compare** and refresh.
- **N of M staged** in the files header — the count that matters — and a filter field that is always there.
- File rows: name before folder, \`+N −M\`, and copy / diff / hunks / discard on hover.
- The footer is **Commit to ‹branch›**, greyed until ready. Type the message first; staging is a row action.

### 🧭 A clean tree says what comes next
- Working Changes with nothing to stage used to be an empty pane. It fills the panel now: **Next steps** (publish, push N, pull N, review what the branch would bring), **Launchpad** (how many pull requests are open), and **Start new** (an issue, a PR review, a stash, a worktree, a branch).
- Every row is true of the repository or it is not drawn — no stash row without a stash, no *Publish* on a published branch.

### 🧺 Working Changes is always there, and selected on open
- A clean tree used to mean no row — and no way into the staging pane. The row is permanent now: \`✎N\` when there is something, a **✓ that stages all of it**, and nothing under it when the tree is clean.
- The panel opens on it, so there are always two panes.
### 🧾 The commit pane says more per row
- The header is **one line** — hash, parent, branch, and what the commit cost as \`+A ✎N −D\` — where it took four. The author's line reads *7 hours ago*; the full date is a tooltip away.
- Each file row carries its own \`+N −M\`, puts the **name before the folder**, and offers history / open on remote / copy path on hover.
- **Compare** against the working tree is a button beside the author. The AI action is an icon with a menu, not a full-width bar.

### 🗃 The commit pane, finished
- The file list has a real bar: **FILES CHANGED** with its count, Path/Tree as icons, one click to copy the file list — and a **filter field that is always there**, the staging pane's rule applied to the commit's list.
- **Explain takes guidance.** A line under the message: say what the explanation should focus on and ask. A guided answer is computed fresh and never cached — it answers your question, not the commit.
- The message has a **copy control** for subject and body, and a message that references no issue says *No autolinks found* rather than showing nothing.
- A commit of yours is signed **You** — by git's own \`user.email\`, so it works offline — with your name a tooltip away.
- The **sort button is gone**: it had shipped with no handler at all. The bar now holds only controls that do something, and a test keeps it that way.
### 🧾 Pull requests and issues, in the left panel
- Two sections among the branches and the tags, with their counts — the place you look at them is beside the rest of the repository, not in a tab that replaces it.
- Each row says what the forge said: a **state icon** (a draft is greyed), the number and the title, then the author, the age and the comment count. The labels live in the hover card and the detail; the row's right edge belongs to the **⋮ of actions**, shown on hover.
- **Right-click an issue to start its branch** — the same gesture, and the same single row component, as the GitHub tab, so the two lists cannot drift apart.
- **Rest on a row and a card opens over the graph** — the description rendered as markdown (headings, task lists, code), status, full labels, assignees, reporter. The card is a **preview**: it never scrolls, what does not fit fades out, and **clicking it opens the issue**. Clamped to the window, so it works in a 400-pixel panel too.
- **The sections start folded** — the graph is the point of the window, and the counts on their headers already say what is behind.
- **Each section is named groups**: *My Pull Requests* · *Assigned To Me* · *Awaiting My Review* · *All Pull Requests*, and *All Open Issues*. The account groups exist only when someone is signed in; an empty group still shows its **0** — that is what says the query ran.
- **A pull request opens in the app too** — the issue detail's sibling: the cost line (*N commits · M files · +A −D*), \`head → base\`, **mergeability read and reported** (checks passed / failed / pending, conflicts, or *still computing* when GitHub says so), description and comments editable in place. **Merge from the pane** when both hold — checks green, no conflicts — as a merge, a squash or a rebase; no conditions, no button. The button always carries the **method you chose**. The pane also says **where you stand**: whether your account may merge at all — a read-only one is told so instead of being handed a button that answers 403 — and, when rules are in the way, **Merging is blocked** and why, github.com's way, followed by *You can bypass this rule and merge anyway* or *You cannot bypass this rule* — asked of the branch's own rulesets, which know whether your account, your team or your app is a bypass actor, rather than guessed from your role. Your standing is stated **before the click**, not discovered by it. The bypass itself, when you have it, is a **separate danger button** revealed by the merge click: consent as its own act. Without the rights: the reason, a disabled button, no bypass offered. Once merged, **Delete Work Branches** cleans the remote and local branch in one action — stepping onto the base first when the branch to delete is the one checked out. GitHub stays the judge, and its message is shown where the click happened.
- **A commit row says its pull request**: a branch that is an open request's head carries a **#N chip**, clickable through to the detail. A lookup into the loaded list — never a search per row.
- **A search box on each section** — a display lens like the staging filter: it narrows what is shown (title, number, author) without re-querying, and the counts keep counting everything. The lists themselves are always the open repository's.
- **Saved filters, per section.** The header's editor takes a name and a query in that section's vocabulary — live validation names the offending token, the syntax sits beside the field, the full reference is a link away. Each filter is **one more named group**, re-querying through GitHub's search: its count is the search's total, with a *+N more on GitHub* tail when the page is shorter. A refused query costs that filter, never the section. Kept per repository.

### 📖 Click an issue: it opens in the app
- A third layout: toolbar and left panel stay — the list is what you are navigating — the graph is replaced by the issue, and the commit panel is not shown, because there is no commit in this context.
- The body rendered, the **comments**, and a box to add one.
- **Everything edits in place**: the title, close/reopen, assignees, labels — each through one PATCH, applied only after GitHub said yes, with a refusal written where the edit happened.
- **Create a Branch for This Issue** — the same call as the row's right-click, one button closer.
- The browser stays one click away, from the detail's own header.
- In the VS Code panel they are two more views on the activity rail.
- No GitHub here, or nothing to authenticate with, means **no section** rather than an empty one.
### 📐 The commit list is rows, not a grid
- The panel carried the desktop's columns in a fraction of the width, dropping an author here and a date there depending on how deep the graph was.
- A commit is a row of two lines now: the message, then the branch it is on, its hash, its author and its date — each placed rather than columned. The date sits at the right edge.
- A line separates each commit, and the graph is at the far left where it starts.
- The desktop keeps its columns; a window with room to spare should use it.

### 🏢 GitHub Enterprise Server
- Settings › GitHub takes an **instance host** and a **token for it**. Every call about a repository on that host goes there rather than to github.com — pull requests, issues, \`#123\` cards, opening a pull request, sharing a patch.
- It is the same API on your own domain, so nothing else changes.
- ⚠️ A host counts as GitHub only once you name it here, and a token is **only ever sent to the host it was entered for** — your github.com credential never reaches your company's server, nor the other way round.

### 🙈 Hide anything from the graph
- A tag, a whole remote and the stash can be taken out of the view now, the way a branch already could — right-click the row, **Hide from Graph**.
- Whole sections hide in one go: **Hide All from Graph** / **Show All in Graph** on the header of LOCAL, REMOTE, TAGS, REMOTES and STASH.
- A section whose rows are hidden **says how many** on its header. Click the count to bring them all back.

### ↩️ Restore a file to the version in a commit
- Right-click it in a commit's file list. It asks first, then leaves the change **unstaged** — what you brought back is a diff you can read before you keep it, not something already staged.
- A file that was deleted since comes back on disk.

### 🌱 Start a branch from an issue
- Right-click an issue in the GitHub panel. It suggests \`123-the-issue-title\`, you edit it or take it, and the branch is created, checked out and **linked to that issue**.
- Linking a branch to an issue has existed since 1.21.0. This is the direction you actually reach for.

### 🔖 A branch can be linked to any tracker's reference
- *Associate issue* still lists this repository's GitHub issues, and the box under them now takes **anything you type**: \`PROJ-421\`, a closed issue the list does not carry, a reference from a tracker we have no integration for.
- If it matches one of your patterns in **Settings › GitHub**, it opens where that pattern points. If it matches nothing, it is still kept and shown on the branch.
- Branch names follow: from \`PROJ-421\` the suggestion is \`PROJ-421-the-title\`, and the key keeps its case.

### 🩹 Signing out of GitHub reaches the whole panel
- The account lives in VS Code's **Accounts menu**; signing out there now empties the GitHub sections, their account groups and any open detail — instead of the panel keeping an account that was gone until it was reopened. Signing in picks everything up the same way.

### 🩹 The panel opens again
- It rendered nothing at all — *Cannot access 'showPrompt' before initialization*. A dependency array is read while the component renders, and two recent handlers listed a value declared further down.
- The comparison tab and the GitHub tab had the same fault in another form, reading values that only exist inside the main panel component. Opening either showed an empty tab.
- None of it reached a release. A build check now refuses any name the panel cannot resolve.

### 🩹 The GitHub lists find a repository whose name has a dot in it
- Reading \`owner/repo\` off the remote stopped at the first dot, so \`my.app\` was read as \`my\` — and an SSH remote with a port handed the **port** over as the owner. Git Vertex then asked GitHub about a repository that does not exist, and the lists were empty with nothing to say why.
- A remote that is not on github.com is now reported as such, rather than guessed at.

### 🩹 Hiding a branch no longer takes your stashes with it
- Hiding handed git the list of branches that remained — and a list of refs replaces \`--all\`, so every commit that only a tag or the stash reached disappeared with it. What you hide is now named and excluded instead.

### 🔀 Comparing says which question it answers
- Two branches now compare on **what the target did since they parted** — the same set the commit list beside it describes, and what a pull request shows. The commit they parted at is named next to it.
- **End to end** is one click away, and is the old behaviour: the difference between the two trees as they stand.
- It used to be measured end to end only, so every file the *other* branch had gained since the split appeared as a **deletion** — a comparison claiming a branch removed files it never touched.

### 📍 Compare the line you are on
- **Compare Line With Previous Revision** opens what the commit that wrote this line actually did; **Compare Line With Working Tree** compares that revision to the file as it stands.
- The blame already knew which commit wrote a line. These are the jump from there, and they work whether or not the annotations are switched on.

### 🌳 Compare against your working tree
- Pick **Working tree** as the target to see a branch against your uncommitted changes.

### 🕘 And it remembers
- The comparisons you have looked at stay as chips under the header, per repository. Click one to go back to it, or clear the lot.

### 🕰 A file's history always opens the same way
- The button in a commit's file list opened a small modal inside the panel, with no diff; the richer view was only in the command palette. Both now open the same editor tab.
`,

  '1.28.3': `## What's new in 1.28.3

### 🩹 A short panel no longer goes blank
- The activity rail moves the icons that do not fit into a **…** button, and that button drew its icon through a helper deleted in 1.28.0's icon refactor — the one call site the refactor missed.
- Nothing failed at build time: the panel's own code was not type-checked. If your panel was too short for the seven icons — a bottom panel, usually — you got a render error instead of Git Vertex.

### 🩹 And the staging area no longer goes blank in Tree view
- Same shape of fault, in code shared with the desktop app: a folder row's tooltip called a function that was not in scope.
`,

  '1.28.2': `## What's new in 1.28.2

### 🖼️ A darker Marketplace icon
- 1.28.1 brought the icon up to date but put it on a pale tile. This listing page is white in its light theme, where a pale tile has no edge at all.
`,

  '1.28.1': `## What's new in 1.28.1

### 🖼️ The Marketplace icon is the app's icon again
- It had not changed since the first release — the original green-and-blue mark, two palettes behind. The listing now shows the same mark you see in the app.
`,

  '1.28.0': `## What's new in 1.28.0

### 🎨 Thirty themes, and four thousand more
- Appearance shows the themes that ship with the app as **real previews** — a miniature commit graph in each theme's own colours.
- **Browse more themes** opens a gallery in its own tab: search by name, filter by dark or light, by colour, by how vivid it is.
- Installing one **keeps the theme you are on**. The tile switches to *Use*, and using it is a second click.
- The names you know: Catppuccin, Dracula, Gruvbox, Tokyo Night, Rosé Pine, Ayu, One Dark Pro, Nord — and VS Code's own Dark+, Light+, Monokai and Solarized.

### 🩹 A diff you can read on every theme
- Thirteen of the built-in themes painted **added and removed lines in the same colour**. They no longer do, and no theme is offered until its four meanings are four different colours.

### 🏷️ Hovering a branch's \`+1\` is readable again
- The refs it was hiding — usually a tag on the same commit — appeared in a panel with no background of its own, drawn straight over the chip of the row below. Two names on top of each other, character by character.
- It is a real popover now, **as wide as the chip it belongs to** — wider only when a name does not fit — and it opens **upwards** when there is no room beneath, instead of past the bottom of the window.
`,

  '1.27.0': `## What's new in 1.27.0

### 🏷️ Your own references become links
- Settings › GitHub takes a list of patterns — a prefix like \`JIRA-\` and a URL with \`<num>\` in it. If your team tracks work anywhere but GitHub issues, its ticket numbers were plain text until now.

### 👥 Add a co-author
- In the commit options. The panel already wrote a \`Signed-off-by\` trailer and already read co-authors to show their avatars — this is the half that was missing. It offers whoever has committed here recently.

### ⌨️ Smaller gestures
- **Right-click a file in the staging list** to copy its path or its name. VS Code's own commands act on the explorer, never on our list.
- **Step through a file's changes** with \`alt+.\` / \`alt+,\`. Each stop is a different commit, so a file written in four sittings has four stops rather than one per line.
- **Clear File Blame Annotations**, for when you want them gone and cannot remember whether they are on.

### 🔗 A link to the lines you selected
- Right-click in the editor: **Copy Link to These Lines** gives the URL your reviewer opens with the selection already highlighted. **Open This File on Remote** is the same thing with the other verb.
- The link points at the **commit that last touched the file**, not at a branch. A link to \`main\` shows something else next week, which is rarely what someone sharing line 40 meant.

### 🔗 …and to a file, a comparison, a request
- **Right-click a file in a commit** to open it on the remote or copy its link — built at that commit, so the lines it points at are the ones you were looking at.
- **Copy a link to a comparison** from the compare tab, to a **pull request or issue** from the GitHub tab, and **Open Branches on Remote** from the branch menu.

### 🔗 And to a branch, a commit, or the repository
- Git Vertex could open a commit on the remote, and that was the whole of it. The URL was written out by hand in six places with **github.com hardcoded in every one**, so a repository hosted anywhere else produced a link to a page that does not exist.
- One place builds links now, from the remote itself — so it knows the host. Copying a link to a **branch** or a **commit** works in the panel as it already did on the desktop, and the shapes for GitLab and Bitbucket are declared rather than assumed.

### 🔑 GitHub sign-in, three smaller things
- **Signing out of GitHub from VS Code now reaches the panel.** Your account lives in VS Code's Accounts menu, and signing out there left settings showing an account that was gone.
- **A revoked token said \`HTTP 401\`** — a bare status code next to the avatar of the account it had just stopped working for. It now reads as what it is, and offers the way back in.
- **We ask for one permission instead of two.** \`read:user\` was never needed, and VS Code matches accounts by their exact set of permissions — so asking for less makes it likelier we can reuse one you have already approved.
`,

  '1.26.0': `## What's new in 1.26.0

### 🔑 Sign in to GitHub without minting a token
- The panel used to offer a Personal Access Token and nothing else, so creating a pull request, the PR and issue lists, and the \`#123\` cards on private repositories were all gated behind a trip to github.com.
- Sign-in now goes through **VS Code's own GitHub provider** — the same one Settings Sync and Copilot use. For most people that means confirming an account they are already signed in to.
- **You choose which account.** VS Code otherwise remembers the one an extension first used and reuses it silently forever, which gave you whichever of your personal and work accounts we happened to land on.
- **Disconnect means Git Vertex stops using your account.** That session belongs to VS Code and no extension can revoke it, so the panel signs itself out, says so, and points at the Accounts menu. Signing in again picks it straight back up.
- A token still works, for editors that do not bundle the GitHub provider and for anyone who prefers a narrowly scoped one.

### 🤖 The Agents view actually lists agents
- The robot icon in the rail opened an empty section from the day it shipped. Finding running agents was a process walk the desktop did on its side, and this one never had it.
- Claude Code, aider, Codex, Gemini, Amp and Goose now show up here as they do on the desktop, and worktree rows get the "an agent is working here" badge that goes with them.

### 🔗 \`#123\` in a commit message opens its card
- The link was already in the graph and the commit panel, but the card behind it never resolved — it asked for the issue and got no answer, falling back to the bare number.
- It now shows the title and whether the issue or request is open, closed or merged. Public repositories answer without a token.

### 🧹 The buttons that did nothing
- Those three were not separate accidents. A test made every method the panel calls be **classified** — implemented here, or written down as desktop-only — but it never looked at the screen, and both kinds fail the same way at runtime. So a method could be declared unavailable and still be wired to a visible control.
- Each one failed **silently**, because every one of those call sites swallowed its own error. A second test now walks what the panel actually loads and fails on anything it can reach that has no implementation.

### 📰 This page, for a start
- After an update the extension used to open \`CHANGELOG.md\` in a markdown preview: the whole file, every version back to 1.0.0, in *Added / Changed / Fixed* sections written for whoever reads the source.
- You are reading the replacement. **Git Vertex: What's New** in the command palette re-opens it, and every past version has a note too — so the history is browsable rather than starting today.

### 🗣️ The same action, the same name, everywhere
- The panel's menus took their wording from the extension manifest and the desktop's from the shared catalogue, with nothing comparing them. Six actions had drifted apart, including the one that detaches HEAD — *Switch to Commit* here, *Check out this commit* there — and the three reset modes.
- They share one vocabulary now, and a test compares both catalogues. Actions that open an input carry \`…\`; the ones that act immediately do not.
`,

  '1.25.0': `## What's new in 1.25.0

### 🎯 A double-click always lands on a branch
- It no longer checks out a commit and detaches HEAD. A local branch is switched to, a remote branch with no local counterpart gets the branch that tracks it, and anything else asks for a branch name at that commit.
- Detaching HEAD is left to the context menu's **Check out this commit**. A tag's entry checks out the *commit* it points at.

### ✏️ Edit the message of any commit
- Clicking a commit's message opened an editor only on the tip of the branch; anywhere else it did nothing, with no hint that it was even possible. It is the same gesture everywhere now.
- **The cost is stated up front**: hovering an older message reads *rewrites 4 commits*, and the button says **Rewrite Message**. A merge commit, the first commit, and a commit outside the current history stay plain text — the first two cannot be replayed, the third is not in the range.

### 🖱️ Two things that fought the cursor
- The commit panel flashed open when double-clicking a branch chip: the first of the two clicks reached the row underneath.
- Submenus closed themselves under the cursor, making the Reset modes and the Delete variants unreachable.
`,

  '1.24.0': `## What's new in 1.24.0

### 🔀 Start a pull request from the panel
- The row was already in the branch menu — in the sidebar, on a graph chip, above the staging files — but it never appeared, because opening a request had no implementation on this side.
- It works the way the desktop's does: the head branch is pushed as part of the action, which the row and the composer both say, and GitHub's own reason comes through when it refuses.

### 🩹 Two silent failures behind it
- The panel could not tell which branch a request should land on, so the rule that decides whether one is offered had nothing to work with.
- The title prefill asked for the wrong commit: it always answered for \`HEAD\`, whatever branch it was given.

### 🛡️ The guard that catches this now runs before a release
- The host-parity test had been failing for two releases without anyone seeing it — the full suite needs a real VS Code, so CI ran it best-effort and the release gate only compiled. Every test that runs in plain node is now a blocking step.
`,

  '1.23.0': `## What's new in 1.23.0

### 📋 One branch menu, in blocks that each answer one question
- Right-clicking a branch used to give a different, shorter menu depending on where you clicked, ordered by which part of the code emitted a row rather than by what the row does.
- It is grouped now: go there, sync it, fold it in, change it, look at it. Rows are tighter, so a long menu no longer needs scrolling.
- **Deleting a branch offers both of its ends** — local, published, or the pair — behind a single Delete entry.

### 🧹 Three entries removed
- **Fetch**, which acts on the whole repository rather than the branch you right-clicked.
- **Pin to Graph Edge**, which never did anything: the pinned branches were stored and read back to draw a checkmark, and no layout code ever looked at them.
- **Switch to Commit** and **Cherry-pick** on the tip of the branch you are already on, where they would detach HEAD where you stand or pick a commit onto itself.
`,

  '1.22.1': `## What's new in 1.22.1

### 🩹 Three fixes in the panel
- **The line numbers beside the merged output were wrong** in the conflict view as soon as it ran past the pane: only the text scrolled, the gutter stayed pinned. In the one place where you check a merge before saving it.
- **Selecting a merge commit left the detail panel reading "Loading…"** forever. git lists no file for a merge, and empty was being rendered as still-loading.
- **A French label in the interactive rebase**, in a panel that is otherwise entirely in English.
`,

  '1.22.0': `## What's new in 1.22.0

### 💬 Every message the panel raised was empty
- "Tag created", "Branch deleted", "Stash popped", "Rebase continued" — forty of them looked up keys that had never been defined, so each action ended with a toast containing nothing. The panel is bundled by a tool that type-checks nothing, so no build ever complained.
- The commit-message editor crashed on a squash step, and the file history on an empty blame pane.

### 🌍 Language
- **French strings in an English panel** — the search placeholder, the interactive rebase, the conflict banner, the reword editor, the toolbar tooltips, every confirmation prompt.
- **git's output no longer depends on your system language**: every invocation runs with a fixed locale, so errors surface in English.

### ⚠️ A notice when git is too old
- Conflict prediction needs git 2.40. Below that it returned nothing and the warning before a merge or rebase simply never appeared, with nothing saying why.
`,

  '1.21.0': `## What's new in 1.21.0

### 🩹 Seven things that were there but did nothing
- **Pull ignored the strategy you picked** — the chevron offers fast-forward only, rebase and the rest; the panel ran a plain \`git pull\` whatever you chose.
- **Partial stashes took everything**, including untracked files, after asking which half you wanted.
- **Renaming a stash, pruning a remote, deleting the branches it leaves behind, and marking a default remote**: the menu entries were there, the operations were not.
- A renamed stash kept its old label, and a stash's diff came back empty though the code to produce it existed.
- **Push, publishing a branch, setting upstream and pushing or deleting a tag all assumed \`origin\`**, ignoring the repository's chosen default remote.
- External diff/merge tools and SSH key browse/generate did nothing from Settings.
`,

  '1.20.0': `## What's new in 1.20.0

### 👁️ Blame, in the editor rather than in a tab
- **Inline blame** — the line your cursor sits on ends with who last changed it, how long ago, and the start of that commit message. Hovering gives the full message, the date and the sha.
- **Unsaved edits are blamed too**: lines you just typed read "You, uncommitted changes" instead of staying attributed to whoever wrote what used to be there.
- **File blame annotations** annotate every line at once and colour the gutter by age — hot for recent, cold for untouched.
- **Git CodeLens** above the file and above each class, function and method: the most recent commit for that range and how many people wrote it.
`,

  '1.19.1': `## What's new in 1.19.1

### ☑️ Checkbox staging list
- The file list is a single checkbox-per-file list, with tri-state folder checkboxes in tree view, instead of separate Unstaged and Staged sections — matching VS Code's own Source Control view.

### ✍️ One free-form commit message
- No more separate summary and description inputs: write your message with your own line breaks, the way \`git commit\` itself works.
- The staging list could render sideways in short wide panels, and the commit button could spill past the panel edges.
`,

  '1.19.0': `## What's new in 1.19.0

### 🎛️ Activity rail
- The panel's sidebar is a slim, always-visible icon rail, like VS Code's own activity bar. Each icon opens one resizable view instead of one tall stacked list: Overview, Agents, Worktrees, Branches, Remotes, Stash, Tags.
- Your active view and the panel width are remembered. When the panel is too short for every icon, the overflow collapses into a "…" menu — icons never shrink.

### 🏠 Overview
- A home view summarizing the checked-out branch — ahead/behind, staged and changed counts — followed by your local branches. The reflog moves to a collapsed section at the bottom.
`,

  '1.18.1': `## What's new in 1.18.1

### 🌍 One language
- Every hardcoded French string is gone from the extension, which now goes through the translation system like the rest.
`,

  '1.18.0': `## What's new in 1.18.0

### 📋 Unified graph context menu
- Right-clicking a local branch opens the same menu as its tip commit — branch actions and commit actions together. Reset, Copy and Move became hover submenus, for a shorter menu.

### 🖱️ Clearer branch drag-and-drop
- "Merge A into B" and "Rebase A onto B" with real branch names and the correct direction, and no menu at all when dragging the branch you are on.
`,

  '1.17.0': `## What's new in 1.17.0

### 📰 "What's new" after an update
- The first time you use the extension after it updates, its changelog opens by itself — like VS Code's own release notes.
`,

  '1.16.0': `## What's new in 1.16.0

### ⚠️ Conflict prediction
- Before a merge, rebase, cherry-pick, revert or pull — and before the graph's drag-and-drop equivalents — Git Vertex works out whether the operation will conflict. A dry run, nothing written to disk.
- Rebase prediction replays the branch commit by commit, so it catches conflicts a naive tip-merge would miss and does not cry wolf about changes undone later in the branch.
- A toggle in Settings controls it, with a "don't ask again" shortcut on the warning itself.
`,

  '1.15.0': `## What's new in 1.15.0

### ✨ AI features, wired into the panel
- Commit-message generation, **Recompose commit with AI** from a commit's real diff, **Explain this commit**, AI-assisted conflict resolution with an explanation of its choices, and natural-language commit search.
- **Cached explanations**: once generated, an explanation persists per repository and commit and re-opens with no API call.

### ⚙️ Full settings page
- The same settings surface as the desktop app — identity and profiles, appearance, graph columns, GitHub, AI provider, key and live model list.

### 🩹 Fixed
- Custom editors no longer hijack files they were not built for: the rebase editor only accepts \`git-rebase-todo\`, and the conflict resolver bounces files with no conflict markers back to the normal text editor.
- AI retries back off properly on 429/503 instead of hammering a rate limit every half second, and bad keys fail fast.
`,

  '1.14.0': `## What's new in 1.14.0

### 📊 Commit graph columns
- Right-click the graph's header to toggle Author, Date, SHA, avatars, and an additions/deletions bar, or switch to a compact layout.
- **Compact mode actually shrinks columns** now — each layout remembers its own widths — instead of just swapping labels for icons.
- Dragging a column border trades width with its nearest visible neighbour, so resizing one never shifts or hides another.
`,

  '1.13.0': `## What's new in 1.13.0

### 📋 Native commit context menu
- The right-click menu on a commit is a real VS Code menu, so the panel's bounds can never clip it. It gained reword on any commit, rebase current branch onto commit, push to commit, create and copy patch, create worktree, open on remote, and compare with a selected commit.

### 🔁 Interactive rebase as a tab
- The planner and the "rebase in progress" tracker are editor tabs rather than modals: branch and onto chips, a step counter, a conflict banner, a filterable list of conflicted files, and drag or keyboard editing of the remaining steps.
- **Choose the final message yourself** when squashing or rewording, instead of git's raw concatenation of the originals.
- The 3-way conflict resolver opens on the actual conflicted file rather than a floating panel with no identity of its own.
`,

  '1.12.0': `## What's new in 1.12.0

### 🗂️ Five new tabs
- **Rebase in progress** opens by itself whenever a rebase is detected, even one started from a terminal: step timeline, conflicted files, Continue / Skip / Abort.
- **Interactive rebase editor** — \`git-rebase-todo\` files open in a visual planner, reorderable by drag.
- **3-way conflict resolver**, per conflicted file, with base fallback and manual edit.
- **File history and blame** — a commit timeline for a file, with per-commit diff or blame.
- **Compare** two branches or tags, and **GitHub PRs and issues** for the repository's remote.
- First open now shows the commit graph rather than the branches sidebar, and the sidebar toggle is remembered.
`,

  '1.5.0': `## What's new in 1.5.0

### 🎉 The full Git GUI, in the VS Code panel
- A real commit graph with coloured lanes, branch and tag chips and author avatars — the same one as Git Vertex Desktop, alongside Terminal and Output.
- Staging area, commit detail panel with inline diff, compact toolbar (fetch, pull, push, branch, stash, undo), branch selector, and a status bar item with ahead/behind.
- Context menu on commits, auto-refresh on \`.git\` and working-tree changes, and **Open in Git Vertex Desktop** to hand the same repository to the app.
`,

  '1.0.0': `## What's new in 1.0.0

### 🌱 Initial release
- The first published version of the Git Vertex extension.
`,
}
