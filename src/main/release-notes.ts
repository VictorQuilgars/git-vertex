// Release notes shown in the "What's new" tab the first time the app opens
// after an update (like VS Code). Keyed by version — must match package.json /
// the release tag. Keep the newest entry in sync with the top of CHANGELOG.md.
export const RELEASE_NOTES: Record<string, string> = {
  'Unreleased': `## What's new in Unreleased

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
- **The sections start folded** — the graph is the point of the window, and the counts on their headers already say what is behind. They are the only door now: the desktop's GitHub tab and the icon rail that opened it are **gone**.
- **Each section is named groups**: *My Pull Requests* · *Assigned To Me* · *Awaiting My Review* · *All Pull Requests*, and *All Open Issues*. The account groups exist only when someone is signed in; an empty group still shows its **0** — that is what says the query ran.
- **A pull request opens in the app too** — the issue detail's sibling: the cost line (*N commits · M files · +A −D*), `head → base`, **mergeability read and reported** (checks passed / failed / pending, conflicts, or *still computing* when GitHub says so), description and comments editable in place. No merge button — merging from the panel arrives with the GitHub write actions.
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

### 🏢 GitHub Enterprise Server
- Settings › GitHub takes an **instance host** and a **token for it**. Every call about a repository on that host goes there rather than to github.com — pull requests, issues, \`#123\` cards, opening a pull request, sharing a patch.
- It is the same API on your own domain, so nothing else changes.
- ⚠️ A host counts as GitHub only once you name it here, and a token is **only ever sent to the host it was entered for** — your github.com credential never reaches your company's server, nor the other way round.

### 🙈 Hide anything from the graph
- A tag, a whole remote and the stash can be taken out of the view now, the way a branch already could — right-click the row, **Hide from Graph**.
- Whole sections hide in one go: **Hide All from Graph** / **Show All in Graph** on the header of LOCAL, REMOTE, TAGS, REMOTES and STASH. Hiding a family keeps hiding what arrives later, so a branch pushed afterwards does not turn up on its own.
- A section whose rows are hidden **says how many** on its header. Click the count to bring them all back.

### ↩️ Restore a file to the version in a commit
- Right-click it in a commit's file list. It asks first, then leaves the change **unstaged** — what you brought back is a diff you can read before you keep it, not something already staged.
- A file that was deleted since comes back on disk.

### 🌱 Start a branch from an issue
- Right-click an issue in the sidebar's GITHUB ISSUES section — or use its ⋮ menu. It suggests \`123-the-issue-title\`, you edit it or take it, and the branch is created, checked out and **linked to that issue**.
- Linking a branch to an issue has existed since 1.21.0. This is the direction you actually reach for.

### 🔖 A branch can be linked to any tracker's reference
- *Associate issue* still lists this repository's GitHub issues, and the box under them now takes **anything you type**: \`PROJ-421\`, a closed issue the list does not carry, a reference from a tracker we have no integration for.
- If it matches one of your patterns in **Settings › GitHub**, it opens where that pattern points. If it matches nothing, it is still kept and shown on the branch.
- Branch names follow: from \`PROJ-421\` the suggestion is \`PROJ-421-the-title\`, and the key keeps its case — it is a name, not prose.

### 🩹 The settings open with no repository
- The gear, the profile chip and \`⌘,\` did nothing at all until a repository was open — no error, just a click that went nowhere. Making the settings a tab had tied them to a repository, which they are not about.

### 🩹 GitHub finds a repository whose name has a dot in it
- Reading \`owner/repo\` off the remote stopped at the first dot, so \`my.app\` was read as \`my\` — and an SSH remote with a port handed the **port** over as the owner. Git Vertex then asked GitHub about a repository that does not exist: empty pull request and issue lists, \`#123\` references that never resolved, and a Launchpad that could not name the repository a row came from.
- Four places read the remote by hand; they now all use the parser that builds the links. A remote that is not on github.com is reported as such rather than guessed at.

### 🩹 Hiding a branch no longer takes your stashes with it
- Hiding handed git the list of branches that remained — and a list of refs replaces \`--all\`, so every commit that only a tag or the stash reached disappeared along with the branch you hid.
- What you hide is now named and excluded. Git keeps deciding what is reachable, so a commit something visible still reaches keeps its place.

### 🧹 The app stops piling up file-watcher listeners
- Subscribing to repository changes handed the callback straight to Electron's bridge and unsubscribing handed it back — but the bridge makes a **new proxy** of the same function on every crossing, so the removal never matched the subscription.
- Every hide, solo or branch switch added a listener and removed none. Git was being run several times for a single change, with filters you had already moved on from.

### 🗂 Views open in tabs, not over the graph
- A file's **diff** and the **settings** join the comparison, the file history and the stash: each opens as a tab, using the whole width.
- A file's diff used to take the middle of the repo view with the sidebar still around it; the settings took the window without being a tab, so nothing could stay open beside them.
- A file **staged** and the same file **unstaged** are two tabs — reading one against the other is the point.
- **Settings stays on the section you were reading.** Leaving that tab is a click elsewhere, not a decision to close it.
- A comparison, a file's history, a stash's contents: each opens as **a tab** with its own name, stays put when you click elsewhere, and closes when you are done. Opening the same one twice returns you to the tab you already have.
- The tab uses **the whole width**: no sidebar, no commit panel, no action bar around it. None of them acts on what the tab is showing, and the point of moving these out of the graph was to stop stacking surfaces.
- What stays a window is what **asks** something — confirm, name this branch, pick a remote before pushing. What **holds** something is a tab.

### 🔀 And the comparison is the full one
- Clicking a commit in either list **opens that commit on its own** in the pane beside it; a click back returns to the comparison. The lists used to be inert.
- **The list of changed files resizes**, wherever a diff is shown. It was 120 pixels whatever it held: three rows, and the rest behind a scrollbar in a box you could not drag. It opens at 200, goes to 640, and stays where you put it — as does the comparison's split between the commit lists and the diff.
- **The comparison says which way round it is reading.** The selectors carry their roles — *from* and *what* — and a line under them spells it out. The order is the whole thing: the commit lists show both sides, the diff only ever describes one, exactly like a pull request.
- An empty comparison **says why**: *since they diverged* reports what the target did, so a branch that is ahead of a \`main\` that has not moved compares to nothing. It names the side that has done nothing, says where the commits are, and offers to compare the other way round.
- The same view the VS Code panel has: since they diverged / end to end, the working tree as a target, and the comparisons you already looked at. The app had three smaller windows, each answering a part of it.

### 🕰 A file's history, in the app
- The button in a commit's file list opened a bare list of commits. It now opens the history view — diff and blame beside the list.
`,

  '1.30.2': `## What's new in 1.30.2

### 🩹 The staging area no longer goes blank in Tree view
- A folder's stage/unstage button built its tooltip through the translation function, from a component that never received it. The moment a folder row carried an action, the panel threw and drew nothing.
- Present since 1.24.0. Two tests now render that view, and the rail of the VS Code panel, precisely to catch this shape of fault.
`,

  '1.30.1': `## What's new in 1.30.1

### 🖼️ A darker app icon
- 1.30.0 shipped the previous mark, and on a pale tile — which all but disappears against a light background: the Finder, a light Dock wallpaper, a README.
- The tile is dark now, and the mark sits on it in the app's own ink.
`,

  '1.30.0': `## What's new in 1.30.0

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

  '1.29.0': `## What's new in 1.29.0

### 🏷️ Your own references become links
- Settings › GitHub takes a list of patterns — a prefix like \`JIRA-\` and a URL with \`<num>\` in it. If your team tracks work anywhere but GitHub issues, its ticket numbers were plain text until now.
- \`#123\` keeps its hover card, with the issue's title and whether it is open, closed or merged.

### 👥 Add a co-author
- In the commit options. Git Vertex already wrote a \`Signed-off-by\` trailer and already read co-authors to show their avatars — this is the half that was missing. It offers whoever has committed here recently.

### 🔗 Links to your code, not just to a commit
- **Right-click a file in a commit** to open it on the remote or copy its link, built at that commit so the lines it points at are the ones you were looking at. Right-click a file in the staging list to copy its path.
- **Copy a link** to a comparison, to a pull request, or to an issue.
- Links are now built from **your remote** rather than from github.com, so a repository on GitLab, Bitbucket or a self-hosted GitHub gets links that work.
`,

  '1.28.0': `## What's new in 1.28.0

### 🗣️ The same action, the same name, everywhere
- The desktop menus and the VS Code panel took their wording from two different places, and nothing compared them. Six actions had drifted apart — the one that detaches HEAD said *Switch to Commit* in the panel and *Check out this commit* here.
- They share one vocabulary now, and a test compares both catalogues, so the next one cannot drift quietly.

### 🚫 Menus without emoji
- 127 menu entries started with one. An emoji does not take the colour of the text beside it, so it could not follow a row going grey when disabled or red when dangerous — and a screen reader read it out before the action itself: *"cherry, Cherry-pick Commit"*.
- The markers that remain — a favourite, a branch hidden from the graph — are plain glyphs that do follow the text. This finishes what 1.19.0 started in the settings.

### ⚠️ The Mixed reset said the opposite of what it does
- It read **keeps unstaged changes**, which sounds like a promise to leave your work alone. \`--mixed\` unstages everything and leaves the working copy alone — the two are not the same, and the label described the wrong one.
- It now reads **keeps your working copy, resets the index**. The other two were already right: \`--soft\` keeps changes staged, \`--hard\` discards them.

### ✏️ Smaller things you may notice
- Action labels are in Title Case, and \`…\` now means what it usually means: the action asks you something. *Cherry-pick Commit* never did, and no longer pretends to.
- The sidebar rail says **Stashes**, like Branches, Remotes, Tags and Worktrees next to it.
- *Hide from graph* and *Show in graph* replace the old mute/unmute wording — the menu already said "hide", only the code disagreed.
`,

  '1.27.0': `## What's new in 1.27.0

### 🎯 A double-click always lands on a branch
- It used to check out a commit and **detach HEAD**. On a remote branch it looked like it worked, but the sidebar dropped the remote prefix and ran \`git checkout test\` — quietly taking you to the *local* branch of that name, three commits further on than the row you clicked.
- git decides now: a local branch is switched to; a remote branch whose name is free locally gets the branch that **tracks** it, created without asking; anything else asks for a branch name at that commit, with an **empty field** — any suggestion would be a guess about what the branch is for.
- **Detached HEAD is left to one place**, the context menu's *Check out this commit*, whose label says so. A tag cannot be checked out as a branch at all: its menu entry checks out the **commit** it points at.

### 🖱️ Two things that fought the cursor
- **The commit panel flashed open** when double-clicking a branch chip: the browser sends click, click, dblclick, and only the last was being stopped, so the first reached the row underneath.
- **Submenus closed themselves under the cursor.** Reaching one of the three Reset modes made the submenu vanish, as if the pointer had left the menu — for two separate reasons, both fixed.

### ✏️ Edit the message of any commit, not just the last one
- Clicking a commit message in the panel opened an editor **only on the tip of the branch**. On a commit four back, the same text was dead — nothing said an edit was even possible. It is one gesture now, everywhere: click, type, confirm.
- On the tip it is still \`commit --amend\`. Behind it, the range is replayed with a reword step — the same thing *Edit message* in the right-click menu already did, minus the modal prompt on top of the text you just wrote.

### ⚠️ And it tells you what that costs
- Hovering an older commit's message reads **rewrites 4 commits**, and the button says **Rewrite Message** instead of *Update Message*, with the count next to it. Rewording anything but the tip gives every commit after it a new SHA, and needs a force push on a branch you have already published.

### 🚫 What it refuses, and why
- A **merge commit** behind the tip: replaying it linearly would drop one of its two sides. (At the tip it stays editable — \`--amend\` keeps both parents.)
- The **first commit** of the repository: there is no parent to replay from.
- A commit **not in the current branch's history**: the replay is built from \`<parent>..HEAD\`, so it would have rewritten a range that does not even contain it.
- In all three cases the message stays plain text rather than offering an edit that would fail, or quietly do the wrong thing.
`,

  '1.26.0': `## What's new in 1.26.0

### 🩺 The app now uses the same git as your terminal
- Launched from the Dock or the Finder, an app does not inherit your shell's PATH — it gets the bare \`/usr/bin:/bin\`. So on macOS, Git Vertex was running **Apple's git 2.39** even for people whose terminal has Homebrew's newer one first, and nothing said so.
- The login shell's PATH is now read back at startup, the git binary is resolved **once** to an absolute path, and every git call in the app uses that one.
- This is what made the "git is too old" notice so confusing: it named a version you could not find, because \`git --version\` in your terminal answered something else entirely.

### 📍 The notice now says which git
- The warning and **Settings → Git** both show the path next to the version — *git 2.39.3 — /usr/bin/git* — plus how it was chosen. On a machine with two gits installed, the version alone points you at the wrong one.
- **Settings → Git** also takes an explicit path if you want to force one, checked on the spot: no restart, and a binary that will not run says so instead of silently reverting.
`,

  '1.25.0': `## What's new in 1.25.0

### 🔀 Pull requests, from the branch you are looking at
- The action lives in the **branch menu** now — sidebar, graph chip, or above the staging files — and the row spells out which way it runs: *Push "feature/x" and start a Pull Request to origin/main*.
- Which branch is the source and which is the target is **worked out, not assumed**: the target must already exist on the remote, nothing is ever proposed *out of* the default branch, and right-clicking another branch while you stand on the trunk makes that branch the source. Where no sensible request exists, no row appears.
- **It also used to not work at all.** GitHub cannot open a request on a branch it has never received, and the app never pushed first — an unpublished branch got a bare *Validation Failed*. The push is now part of the action, and when GitHub still refuses it says why: *Validation Failed (No commits between main and feature/x)*.

### 🧭 One branch menu, wherever you open it
- The graph used to build its own shorter version — a chip offered checkout, merge and rebase while **push, rename, delete and compare never appeared**, though the app could do all of them. Chips and sidebar rows now show the same menu.
- It is grouped by what an action is *for* — go there, sync it, fold it in, change it, the commit it points at, look at it — instead of by which part of the code emitted the row. **Copy** and **Compare** are one entry each now, rather than one near the top and another twenty rows below.
- Rows are **23px instead of 27**, and only variants of a single idea fold away, so every daily action stays one click. The menu had reached the point of scrolling.

### ➕ Three things that were missing
- **Copy the link** to a branch or to a commit, next to the entries that only knew how to open them.
- **Create an annotated tag** from a commit, alongside the lightweight one.
- **Delete both ends of a branch** — local, published, or the pair in one confirmation. The remote side used to mean hunting down its row in the REMOTE section.

### 🧹 Three rows that could not do anything
- **Fetch** left the branch menu: it acts on the repository, not the branch you right-clicked.
- **Pin to Graph Edge** never pinned anything — the state was stored and read back to draw a badge, and no layout code ever looked. Favorites already keeps a branch in view.
- **Switch to Commit** and **Cherry-pick** no longer show on the tip of the branch you are on, where they would detach HEAD where you already are, or pick a commit onto itself.
`,

  '1.24.1': `## What's new in 1.24.1

### 🔢 Line numbers that follow the merged output
- In the **conflict resolver**, only the text of the merged output scrolled — the gutter beside it stayed pinned at the top. Past the height of the pane, every number faced the wrong line, right where you check a merge before saving it. The gutter now follows the text, like the two source panes already follow each other.

### 🔀 Merge commits no longer load forever
- Selecting a **merge commit** left the detail panel on *Loading…* for as long as it stayed selected. git lists no file for a merge, and that empty answer was shown as if it were still loading. The panel now says there is nothing to list, and why.

### 🇫🇷 One last French label
- The line above the message box when **squashing or rewording** a commit in the interactive rebase was still in French.
`,

  '1.24.0': `## What's new in 1.24.0

### 🌍 English, everywhere
- French had survived in the **interactive rebase editor**, the commit detail, the file history, the conflict panel, the branch comparison and the graph's column menu — even though the app ships English-only. All of it goes through the translations now.
- **Dates read in English too**: \`Jun 10, 2026\` instead of \`10 juin 2026\`, which appeared whatever the interface language.

### 🔤 Three things that displayed nothing
- The PR modal's **Close** button, the Command Palette's **"no matching command"** line and the toast after **aborting a merge** all asked for a translation that had never been written, so they rendered empty.
- The **file history** crashed outright when a blame pane had nothing to show.

### 🔒 git's output no longer depends on your system language
- Every git call runs with a fixed locale. Its error messages reach the interface in English, and nothing in the app matches a translated sentence any more.

### ⚠️ A notice when git is too old
- Predicting conflicts before a merge, rebase, cherry-pick or revert needs **git 2.40** (\`merge-tree --merge-base\`). On an older git — macOS still ships 2.39 — that prediction quietly returned nothing and the warning never appeared. The app now says so once. Everything else works from git 2.28 on.
`,

  '1.23.0': `## What's new in 1.23.0

### 🏷 Tags you can actually check out
- **Double-click a tag** in the sidebar, or pick **Checkout** from its context menu. Before, double-clicking a tag simply did nothing. HEAD ends up detached — the message says so.

### 🧹 Prune, in one gesture
- **Prune stale refs** on a remote's context menu clears tracking refs for branches that no longer exist upstream — then offers to delete the local branches those refs left stranded.

### 📦 Stash, in parts
- The **+** on the stash section now asks what to take: **everything**, the **index only**, or **only what isn't staged**.
- **Rename a stash** from its context menu. git has no rename, so the entry is re-stored under its new label and moves to the top of the stack.

### 🌐 A default remote, per repository
- Mark a remote as the default from its context menu — it carries a **default** badge, and push, pull, branch publishing and tag actions all target it instead of assuming \`origin\`.
- Stored as \`gitvertex.defaultRemote\` in the repository's own git config, so it stays readable from the command line.
`,

  '1.22.0': `## What's new in 1.22.0

### ⬇️ Pull, your way
- The chevron next to **Pull** now opens a menu — **Fetch All**, **Pull (fast-forward if possible)**, **Pull (fast-forward only)**, **Pull (rebase)**. Whichever you pick becomes the main button's action, and is remembered across restarts.

### 🐛 Fixed
- The **command palette** (⌘P) crashed to a black screen every single time it was opened.
- Branches sharing a name across remotes now show their prefix (**origin/main**, **archive/main**) instead of two identical rows — and only when the name actually collides.
`,

  '1.21.1': `## What's new in 1.21.1

### ♿ Accessibility
- Every **icon-only button** now carries an accessible label, so screen readers announce what it does instead of reading an unlabelled control. A test guards this from now on: a new unlabelled button fails the build.
`,

  '1.21.0': `## What's new in 1.21.0

### 🌿 Branch strip in the changes panel
- The branch name, **publish**, **fetch** and the branch menu now sit right above the file list — no more reaching for the toolbar while you work in the staging area.
- **Associate an issue** is offered inline when none is linked yet.

### 📊 A denser file list
- **Per-file line counts** (\`+N −M\`) on every changed file. Untracked and binary files stay blank — git reports no counts for them.
- **"N staged"** badge in the header, alongside the total.
- **Stash** and **Discard all** now reachable straight from the staging header.
- **Open changes** on a file row for a direct diff, and **copy the list** of changed files.
`,

  '1.20.0': `## What's new in 1.20.0

### 🌿 One menu for every branch action
- Checkout, fetch, pull, push, upstream, rebase onto, compare, rename, delete, solo/mute — all in a **single menu**, reachable from a **⋮** button on hover and from right-click, in the sidebar and next to the toolbar's branch selector. No more hunting across three different places.
- **Open branch on remote** — jump to the branch page on GitHub.
- **Favorite branches** — star the ones you visit often; they float to the top of the list.
- **Associate an issue** with a branch; its number shows as a badge next to it.

### 🔍 Filter the staging list
- A search box over the changed files, in both list and tree view. It is a display lens only — counters, the master checkbox and staging actions still act on the full set.
`,

  '1.19.0': `## What's new in 1.19.0

### ⚙️ Settings: General, External Tools, SSH
- New **Behavior** options: default branch name, auto-fetch interval, and auto-update-submodules.
- Dedicated **external diff / merge / terminal** tool settings.
- **SSH key management**, wired to \`core.sshCommand\`.
- Sober line icons replace colored emoji in the Settings navigation.

### 🐛 Fixed
- A Settings navigation label collision (two items both named "General").
- The default branch name wasn't applied when the Init modal opened before settings finished loading.
`,

  '1.18.2': `## What's new in 1.18.2

### 🧹 Settings cleanup
- Removed the **Environment** block (Electron / Node.js / Chrome versions) from **Settings → About**.
`,

  '1.18.1': `## What's new in 1.18.1

### ✍️ Commit message, simplified
- The commit message is now a **single free-form field** — write it with your own line breaks, exactly like \`git commit\` does. No more separate summary/description inputs.
- Removed the conventional-commit type picker and character counter to give the message field more room.

### 🤖 AI generate, always in reach
- **Generate with AI** now shares the **Amend previous commit** row, at every panel size.

### 🐛 Fixed
- The commit-form resize handle is no longer capped by short window sizes — drag it as tall as you want.
`,

  '1.18.0': `## What's new in 1.18.0

### 🗂️ Repository Management
- A new **folder button** in the tab bar opens a full-page **Repository Management** hub (an overlay, not a tab).
- **Open / Favorites / Recent** sections (collapsible, searchable) with a **WIP summary** toggle showing branch + ✎/+/− per repo.
- Per-row actions: open, **favorite** (★), **open in external editor**, **repository details** (README rendered in a slide-in), remove.
- **New Workspace** modal to name a workspace and assign repos to it.

### ⬇️ A real Clone dialog
- Provider nav (**Clone with URL** / **GitHub.com**), a **Where to clone to** field with Browse, a searchable list of your remote repos, and **Shallow Clone** / **Sparse Checkout** options.

### ＋ A real Init dialog
- **Initialize a Repository** modal — **Local Only** (name, location, default branch, optional .gitignore + license, LFS) and **GitHub.com** (create the remote repo and clone it).

### 🐛 Fixed
- Tabs now stick to the left in macOS **fullscreen** (the traffic-light spacer is dropped).
`,

  '1.17.0': `## What's new in 1.17.0

### 🚀 Launchpad
- A brand-new **full-page Launchpad**, opened by the **rocket button** in the tab bar.
- **My Pull Requests**, **My Issues**, **WIPs**, **All** and **Snoozed** tabs, with a search box, workspace and label filters, and always-visible counts.
- User-centric feed: your open PRs and issues across **all** your GitHub repos.
- **WIPs**: scans your local repos for uncommitted work (✎ files · + / − lines) and lets you jump straight into one.
- Row actions: **View Repo** (opens the local tab when cloned), **Open on GitHub**, **Copy link**, **Mark as closed**, and **Create cloud patch** on WIPs.
- **Pin** and **snooze** any item — free (no paid license needed).

### 🗂️ Multiple home tabs
- Every **+** opens a fresh **Home** tab, so you can keep several open at once.

### 🔗 Recovered features
- **Named workspaces** over your recent repos, managed from the Launchpad.
- **Share a commit's patch** as a secret-gist link.

### 🐛 Fixed
- Sharing a patch now requests the **gist** scope (reconnect GitHub to grant it).
`,

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
