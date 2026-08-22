# Changelog — Git Vertex (desktop)

## Unreleased

### Added
- **Every section in the left panel carries its own mark.** LOCAL, REMOTE, REMOTES, TAGS, STASH, WORKTREES, SUBMODULES, REFLOG, PULL REQUESTS, GITHUB ISSUES and AGENTS each show an icon before their name. Eleven headers set in the same small capitals are told apart by reading them; a mark is what the eye lands on when it is not reading, which is what a panel you glance at needs. They come from the set the app already draws — the machine for LOCAL, a cloud for the branches the remote holds, and each of the others its own.
- **The sidebar draws a branch name as the path it is.** `feat/views-in-tabs` and `fix/a` no longer sit as two long strings in a flat list: the segments before the last are folders, each saying how many branches are under it, and a leaf reads as its last segment because the folders above already spell the rest. REMOTE groups by remote first, so `origin` is a level rather than a prefix on every row — which is also what now tells two `main`s apart, and why the prefixing that used to do it is gone. The tree starts level with the section's own title and never left of it, and a folder carries no disclosure triangle — clicking the row is what folds it. A folder you close stays closed, per repository; everything else opens. **A filter flattens the tree** for as long as it is set: a tree that stays folded while you type reads as an empty section, and every row keeps its full name while filtering. Nothing a row carries changes — the menu, the `#N` chip, ahead/behind, favourite, solo, hide and drag-and-drop are the same rows, differently arranged.
- **The pull request and issue sections can be refreshed.** They only ever reloaded when a repository was opened, or after a write made from the detail pane — so a request opened, merged or commented on anywhere else stayed wrong on screen until you reopened the repository. Each section header now carries its own refresh: they are two lists from two calls, and refreshing both because one looks stale spends two requests to answer one question. A refresh also **forces the saved filters past their cache** — those re-query through GitHub's search, which is held for 20 seconds, so without that the one click you make *because* the list looks wrong would hand you back the same list. The button is out of action while its own section is in flight, since each saved filter is one more request against a search API capped at thirty a minute.
- **The commit pane says more per row.** The header is one line now — hash, parent, the branch, and what the commit cost as `+A ✎N −D` — where it used to take four; the author's line reads as *7 hours ago* with the full date a tooltip away. Each file row carries its own `+N −M` at the right, puts the name before the folder, and offers its actions on hover — history, open on remote, copy path — instead of only in a menu. **Compare** against the working tree is a button beside the author, and the AI action is an icon with a menu rather than a full-width bar: a proposal the model makes is not the purpose of the pane.
- **The commit pane's remaining reference rows.** The file list has a real bar now — **FILES CHANGED** with its count, Path/Tree as icons, one click to copy the file list — and the filter is a field that is always there, the staging pane's rule applied to the commit's list. **Explain** takes guidance: a line under the message where you say what to focus on; a guided answer is computed fresh and never cached, because it answers your question, not the commit. The message has a copy control for subject and body; a message that references no issue says *No autolinks found* rather than showing nothing; and a commit of yours is signed **You**, your name a tooltip away.
- **The pull requests and the issues are in the left panel**, as two sections among the branches and the tags, with their counts. Each row says what the forge said: a state icon (a draft is greyed), the number and the title, then the author, the age and the comment count. Right-click an issue to start its branch — the same gesture, and the same single row component, as the GitHub tab, so the two lists can no longer drift apart. Rest on a row and a **hover card opens over the graph**: the description rendered as markdown (headings, task lists, code), the status, the full labels, assignees and reporter — clamped to the window and never scrolling: the card is a preview, what does not fit fades out, and clicking the card opens the issue itself. Clicking a **pull request** now opens its own detail in the centre, the issue detail's sibling: the cost line (*N commits · M files · +A −D*), `head → base`, **mergeability read and reported** — the checks of the head ref (passed / failed / pending), GitHub's own conflict verdict, including *still computing* when that is the truth, and **whether you may merge at all**, your permission on the repository stated with the rest: a read-only account is told so rather than offered a button that would answer 403 — the description and the comments editable through the same endpoints an issue uses. And when both hold — checks green, no conflicts — a **merge button** is there (merge, squash or rebase, your pick), the pane flipping to *Merged* on GitHub's yes and showing GitHub's own message on its no. The button always says the **method you chose**. When rules block the request, the pane speaks github.com's language: a warning block says **Merging is blocked** and why — *at least one approving review is awaited*, *changes have been requested* — and where **you** stand against that rule — *You can bypass this rule and merge anyway* when the account is one of its bypass actors, *You cannot bypass this rule* when it is not. That is asked of the rulesets protecting the base branch, each of which carries GitHub's own verdict for the signed-in account, rather than guessed from a permission level: a ruleset that grants the bypass to a team, an app or a single role is read correctly, and the common shape — a broad ruleset nobody bypasses beside a narrow one you do — answers yes. Your standing is said before the click rather than discovered by it. When you can, the method button's click reveals a **separate danger button**, *Bypass Rules and Merge*: consent is its own act, on its own button, gone on a click elsewhere. Without the rights, the method button is disabled and there is no bypass button at all — the reviews are what is awaited. The merge goes through GraphQL, where a bypass actor's rights actually apply — the REST merge refuses them. Once merged (or closed), the pane offers **Delete Work Branches** — the remote head branch and the local one, in one action, each outcome reported where the click happened. Deleting the branch you are standing on — the commonest case, you just merged its request — steps onto the base branch first, the reference clients' answer; any other refusal stays git's own message. When nothing holds, there is no button at all: a disabled button explaining itself is still a button that cannot be pressed. And on the graph itself, a branch that is an open request's head carries a **#N chip** beside its branch chip — a lookup into the already-loaded PR list, never a search per row — and clicking it opens that detail. The sections start folded: the graph is the point of the window, and the counts on their headers already say what is behind. They are also the only door now: the desktop's GitHub tab and the icon rail that opened it are gone — the sections and the issue detail are the integration. Inside, each section is **named groups**, not one flat list: *My Pull Requests*, *Assigned To Me*, *Awaiting My Review* and *All Pull Requests* for the first — the three account groups exist only when someone is signed in, and an empty one still shows its 0, which is what says the query ran — and *All Open Issues* for the second. The asymmetry is the point: a pull request is something you are personally on the hook for, an issue is not. Above the groups, each section carries a **search box**: a display lens like the staging filter, narrowing what is already shown without re-querying, the counts still counting everything — the lists themselves are always the open repository's. Beside it, **saved filters**: the section header's ⧩ opens an editor — a name, a query in that section's vocabulary, live validation that names the offending token, the syntax beside the field and the full reference a link away — and each saved filter becomes **one more named group** that re-queries through GitHub's search, its count the search's own total with a *+N more on GitHub* tail when the page is shorter than the count. A refused query costs that filter, never the section, and filters are kept per repository. In the VS Code panel they are two more views on the activity rail, which is how that rail already works. A repository with no GitHub — or nothing to authenticate with — shows no section at all, rather than two empty ones.
- **Clicking an issue opens it in the app** — a third layout, defined precisely: the toolbar and the left panel stay (the list is what is being navigated, which is why this is not a tab), the graph is replaced by the issue, and the commit panel is not shown, because there is no commit in this context. The detail carries the issue's own side column — status, assignees, labels, and *Create a Branch for This Issue*, the same call the row's context menu makes. The body renders as markdown, the **comments** are there with a box to add one, and **everything edits in place**: click the title to rename it, the pencil beside a field for the rest — close and reopen, assignees from the people who can be assigned, labels from the repository's own. Every write goes through one PATCH and applies only after GitHub said yes; a refusal is written where the edit happened. Closing the detail restores the graph and the commit panel. The browser is still one click away, from the detail's own header.
- **Git Vertex talks to a GitHub Enterprise Server instance.** Settings › GitHub takes the instance's host and a token for it, and every call about a repository on that host goes there instead of github.com — pull requests, issues, `#123` cards, creating a pull request, sharing a patch. It is the same API on your own domain, so nothing else changes. ⚠️ A host is only treated as GitHub once you have named it: nothing in a hostname says whether a self-hosted forge is GitHub or something else. And a token is only ever sent to the host it was entered for — your github.com credential does not go to your company's server, nor the other way round.
- **A file's diff and the settings open in a tab too.** A file's diff took the middle of the repo view with the sidebar and the commit panel still around it; the settings took the whole window without being a tab, so nothing could be kept open beside them. Each is a tab now, full width, and asking for the same one again returns to it. A file staged and the same file unstaged are two tabs, because reading one against the other is the point. Settings also stays on the section you were reading: leaving the tab is a click elsewhere, not a decision to close it, and coming back to the top of the list every time was the tab forgetting what you were doing.
- **Comparisons, a file's history and a stash's contents open in a tab**, not in a window over the graph. The tab is the whole window — no sidebar, no commit panel, no toolbar around it, because none of them acts on what you are looking at. They have a name in the tab bar, they stay put when you click elsewhere, you can keep several open, and opening the same one twice takes you back to the tab you already have. The tab is named after what it shows, and follows it: change the two refs and the name changes with them.
- **A commit in a comparison opens on its own.** The two lists were inert — you could read the hashes and nothing else. Clicking one shows that commit's diff in the pane beside it, and a click back returns to the whole comparison.
- **The list of changed files is as tall as you want it, everywhere a diff is shown.** It was 120 pixels whatever it held — three rows, the rest behind a scrollbar inside a box that could not be resized, which is no way to choose what to read out of twenty files. It opens at 200 now, drags to 640, and remembers. The comparison's own split between the commit lists and the diff drags too.
- **A comparison says which way round it is reading.** The two selectors carry their roles — *from* and *what* — and a line under them spells the comparison out: "what this branch has done since it left main; main itself is not described, it is the starting point". Two anonymous dropdowns with a `…` between them left the direction to be guessed, and the direction is the whole thing: the commit lists show both sides, the diff only ever describes one.
- **A comparison with nothing in it says why.** "Since they diverged" reports what the *target* did, so comparing a branch that is ahead against a `main` that has not moved is legitimately empty — while the list beside it shows commits, which reads as a failure. It now names the side that has done nothing, says where the commits actually are, and offers to compare the other way round.
- **The comparison view is the full one now** — the same one the VS Code panel has: which question it answers (since they diverged / end to end), the working tree as a target, and the comparisons you have already looked at. The app had three smaller windows instead, each answering a part of it.
- **A file's history is in the app at last.** The button in a commit's file list opened a modal list of commits with no diff; it now opens the history view, with the diff and the blame beside it.
- **Hide anything from the graph, not just a branch.** A tag, a whole remote and the stash can now be taken out of the view the way a branch already could — right-click the row and *Hide from Graph*. Each section also hides in one go: LOCAL, REMOTE, TAGS, REMOTES and STASH carry *Hide All from Graph* and *Show All in Graph* on their header, and hiding a whole family keeps hiding what arrives later, so a branch pushed afterwards does not reappear on its own.
- **A section says how much of it the graph is not showing.** Its header carries a count of what is hidden, and clicking that count brings everything in the section back. Hiding used to leave nothing on screen to say the graph was filtered.
- **Restore a file to the version in a commit.** Right-click it in a commit's file list. It asks first, then leaves the change unstaged — so what you brought back is a diff you can read before you keep it, rather than something already staged. A file deleted since comes back on disk.
- **Start a branch from an issue.** Right-click an issue in the sidebar's GITHUB ISSUES section (or use its ⋮ menu): it suggests `123-the-issue-title`, you edit it or accept it, and the branch is created, checked out and linked to that issue — so the branch shows its issue number from then on. Linking a branch to an issue already existed; this is the direction you actually reach for.

### Changed
- **The git icons read at the size they are actually drawn.** A branch, a merge, a rebase, a pull request, a worktree — the nodes in each were open rings, and an open ring of that radius has a **0.12-pixel hole** at the eleven pixels the sidebar draws them at. The ring closed anyway, so it was never a ring; it was a soft blob with a fuzzy edge, which is why the marks looked thin and hard to tell apart. The nodes are filled discs now, slightly larger, and the nine marks that carry one are **floored at 13 pixels** wherever they are drawn — a 2.4-unit disc is 2.2 device pixels at eleven, which is under the three a disc needs to read as a shape rather than a smudge. The floor is in the icon component, beside the one that already exists for the two most detailed marks, so it holds wherever one is drawn next and cannot catch the chevrons that are deliberately eight. The set loses one distinction — an arrival point used to be filled where a source was open — but that distinction was invisible below roughly 24 pixels, which is where none of these are drawn.
- **The graph's branch scope moved to the left panel, out of the toolbar.** *Show all branches* was a button in the top bar — the only part of the system that decides what the graph draws to live anywhere but the panel, where hiding a ref, hiding a whole family and soloing a branch have always been. It is now **All Branches in the Graph** on the LOCAL header's menu, ticked when it is on, ruled off from the hide entries above it because it is not one of them: hiding takes refs away from what the graph collects, this decides whether it collects them at all.
- **No more emoji in the interface.** The 🗑, 🔀, 🔗, ⛙, ✏, ⚡ and the arrows that led a menu row are gone, and so is the ✓ that every success message carried — the chip that reports an action draws its own icon now, so that was a second tick beside the first. A convention test already forbade this and had been passing for a year on half the catalogue: it read only the entries whose value is a plain string, and every label taking an argument is a function. It reads both now, and caught five more the moment it could see them.
- **Opening a pull request is a right-click action, not a toolbar button.** The **PR** button in the top bar is gone. It could only ever propose the one request the checked-out branch would open, while the right-click row on any branch says which way the request runs and against what — and is the only one of the two that can say a request is already open. One place, one answer.
- **The typecheck gate covers the two places it did not.** `npm run typecheck` read the renderer and nothing else, so `src/main` and `src/preload` were checked only by whichever files a test happened to import — and the panel's own entry files were excluded from every program, because esbuild bundles them and esbuild does not resolve names. An identifier that does not exist bundled cleanly and threw at mount, which is how `I is not defined` reached a shipped panel and took three versions to surface. Both are gated now, and both had a backlog to clear first: 4 findings in the main process, 130 in the panel. The panel's bridge is the reason for most of them — it had been declared `any`, which is a hole the compiler cannot see through, and is now the shared renderer's own interface plus the methods only the extension host answers.
- **The chip that confirms an action was redesigned, and moved.** It used to appear at the bottom right — exactly where the Commit button sits, so the confirmation of what you just did covered the control you reach for next. The stack is at the bottom **centre** now, which also fits a panel far narrower than a window. It is a **chip rather than a tinted card**: one line on the ordinary surface with a real icon in the colour of the outcome, instead of a card washed in that colour, which made every success shout as loudly as every failure. **An error no longer expires** — a success is over once read and goes on a timer, but a failure waits to be dismissed and carries git's own message. **Repeats collapse**: the same result ten times running is one chip and a count, and the stack is capped, so a loop over many files cannot bury the window it is reporting on. It is also **announced to screen readers** for the first time — the stack is a live region, errors interrupt, the rest waits its turn. And the **staging area speaks at last**: staging, unstaging and discarding a file each confirm, where all three used to say nothing — discarding worst of all, being destructive and silent. The rule behind those calls is written down once now: a mutating action confirms, navigation does not.
- **The issue a branch is working on no longer has to be a GitHub number.** *Associate issue* still lists this repository's GitHub issues, but the box under them now takes any reference you type — `PROJ-421`, `ABC-9`, a closed issue the list does not carry. If it matches one of the reference patterns from Settings › GitHub, the link opens where that pattern points; if it matches nothing, the reference is still kept and shown on the branch. Branch names follow: a branch created from `PROJ-421` is suggested as `PROJ-421-the-title`, with the key's case left alone because a key is a name, not prose.

### Fixed
- **The pull request row says which way the request runs, and promises a push only when there is one to make.** It now reads *Start a pull request to origin/main from origin/your-branch* when the remote already has the branch's tip, and *Push your-branch and start a pull request to origin/main* when it does not — whether that is because the branch has never been pushed or because the tip is still only local. Both ends are named on your own branch's row too, where the base used to stay implicit: the row you use most said the least about what it was going to do. The head reads as its remote ref only when nothing is left to push, because what a push moves is the local branch.
- **A branch already on the remote no longer offers to push it again.** The right-click row read *Push "x" and start a Pull Request* whether or not the branch had ever left the machine — so on one you had just pushed it promised work that would not happen, and read as though the push had not registered. It says *Start a Pull Request from "x"* in that case. Which of the two you get was already decided when the row was built; only the label was not asking.
- **Three panel commands that did nothing now work, and an avatar lookup that never ran does too.** All four were found the same way: by type-checking the two places nothing type-checked. *Add Worktree* in the panel's sidebar, and the **Browse** buttons of Clone and Init, each read `.path` off the folder picker's answer — but the extension host returned the bare path string instead of the `{ path }` the desktop returns, so the check was always false and the three did nothing at all. **Checkout** on a tag in the panel's sidebar was never handed its handler, so it was `undefined` at the click. And on the desktop, the avatar lookup that resolves your own commits — including unpushed ones, and private e-mail addresses — read a name that does not exist where it stood: it threw on every call, into a `catch` that swallowed it whole and cleared the memo so the next call could fail the same way. It had never once worked; avatars quietly fell through to a slower path.
- **A branch whose pull request is already open no longer offers to start one.** Right-clicking it still read *Push and start a Pull Request*, on a branch whose request was open two panels away — the same list that puts the `#N` chip beside it. The row is gone in that case, on both surfaces: the same head into the same base is the one thing GitHub refuses outright, so the menu was offering an action the API would have rejected. The same head into a **different** base is still offered, because a stacked request is a different request. With no GitHub remote — or in the moment before the list has arrived — the row behaves exactly as it did.
- **The sort button over a commit's files is gone, because it never sorted.** It had shipped with no handler at all — a control that looked like a feature and did nothing on any surface. The files bar now holds only controls that do something, and a test keeps it that way.
- **The settings open with no repository.** The gear, the profile chip and `⌘,` did nothing at all until a repository was open — no error, no message, just a click that went nowhere. Making the settings a tab had tied them to a repository, which every other tab genuinely is about and the settings are not.
- **GitHub features find your repository when its name has a dot in it** — or when the remote is an SSH URL with a port. Everything that talks to GitHub starts by reading `owner/repo` off the remote, and the pattern doing that stopped at the first dot, so `my.app` was read as `my`; a remote like `ssh://git@github.com:22/owner/repo.git` handed over the **port** as the owner. Git Vertex then asked GitHub about a repository that does not exist: the pull request and issue lists came back empty with nothing to say why, `#123` references never resolved, and the Launchpad could not name the repository a row belonged to. It now reads the remote with the same parser that builds the links, in the one place all four used to do it by hand — and a remote that is not on github.com is reported as such instead of being guessed at.

- **Hiding a branch no longer takes your stashes with it.** Hiding handed git the list of branches that remained, and an explicit list of refs replaces `--all` — so every commit that only a tag or the stash reached vanished along with the branch you hid. What is hidden is now named and excluded, git keeps deciding what is reachable, and a commit something visible still reaches keeps its place.
- **The stash hides as a group, and says so.** The entries of `git stash list` are the reflog of a single ref, so git can take all of them out of the graph or none — the action lives on the section rather than promising, per row, something git cannot do.
- **A change to what the graph shows now always reaches the graph.** A reload asked for while another one was running was dropped and never retried — invisible for a background refresh, since the next file-watcher event covers it, but not for hiding a branch: there is no next event, so the graph kept showing what you had just hidden until something else in the repository changed. Found by driving the real app; no test saw it.
- **The app stops piling up file-watcher listeners.** Subscribing to repository changes handed the callback straight to Electron's bridge, and unsubscribing handed it back — but the bridge builds a *new* proxy for the same function every time it crosses, so the removal never matched what the subscription had registered. Every hide, solo or branch switch added a listener and removed none, and the ones that fired were an accumulation of stale ones: git was run several times for a single change, with filters you had already moved on from. Subscribing now hands back its own unsubscribe, which is the pattern every other event in the app already used.

## 1.30.2

### Fixed
- **The staging area no longer goes blank in Tree view.** A folder row's stage/unstage button built its tooltip through the translation function, in a component that never received it — so the moment a folder carried an action, the panel threw and rendered nothing. Present since 1.24.0.

## 1.30.1

### Fixed
- **The app icon is the current mark, on a dark tile.** 1.30.0 shipped the previous one, and the tile it was drawn on was pale — which all but disappears against a light background: the Finder, a light Dock wallpaper, a README page. Measured across the surfaces an icon actually lands on, a pale tile loses its edge on five of nine and a dark one on three.

## 1.30.0

### Added
- **Thirty themes, and four thousand more a click away.** Appearance shows the ones that ship with the app as real previews — a miniature commit graph in each theme's own colours, not a coloured square. "Browse more themes" opens a gallery in its own tab: search by name, filter by dark or light, by colour, by how vivid it is. Installing one keeps you on the theme you are reading it in; the tile switches to *Use*, and using it is a second click.
- **The themes are the ones you already know.** Catppuccin, Dracula, Gruvbox, Tokyo Night, Rosé Pine, Ayu, One Dark Pro, Night Owl, Nord, and Visual Studio Code's own — Dark+, Light+, Monokai, Solarized, Abyss, Quiet Light. Every palette is mapped onto the app's own roles, so the graph lanes, the diff colours and the buttons all follow, and every one is checked for contrast before it is offered. All are under permissive licences; `THIRD-PARTY.md` credits each author and the version their palette came from.

### Fixed
- **Added and removed lines were the same colour in thirteen of the built-in themes.** Dark+, Light+, Solarized, Monokai and nine others painted an addition and a deletion identically — a diff you cannot read. Two causes, both now handled: a theme file may inherit another and carry only its overrides (Dark+ declares no colours at all), and a theme that names no colour for "added" had all four of its meanings collapse onto one.
- **Hovering a branch's `+1` showed an unreadable pile.** The refs it was hiding — a tag on the same commit, usually — appeared in a panel with no background of its own, drawn straight over the chip of the row below: two names on top of each other, character by character. The panel is now a real popover, as wide as the chip it belongs to — wider only when a name does not fit — and it opens upwards when there is no room beneath, instead of past the bottom of the window.

## 1.29.0

### Added
- **References in commit messages become links — yours, not just `#123`.** Settings › GitHub takes a list of patterns: a prefix (`JIRA-`) and a URL with `<num>` in it. Teams that track work anywhere but GitHub issues were reading their own ticket numbers as plain text.
- **Add a co-author to a commit**, from the commit options. The panel already wrote a `Signed-off-by` trailer and already read co-authors to show their avatars; this is the half that was missing. The candidates are whoever has committed here recently.
- **Right-click a file in a commit** to open it on the remote or copy its link — built at that commit, so the lines it points at are the ones you were looking at. Right-click a file in the staging list to copy its path or its name.
- **Copy a link to a comparison**, and to a pull request or an issue.

### Changed
- **Links are built from your remote, not from github.com.** The URL was written out by hand in six places with the host hardcoded in every one, so a repository on GitLab, Bitbucket, or a self-hosted GitHub produced a link to a page that does not exist. One builder reads the remote and knows the shapes.

## 1.28.0

### Changed
- **The same action reads the same everywhere.** The desktop menus and the VS Code panel drew their wording from two different places, and six actions had drifted apart: the one that detaches HEAD said *Switch to Commit* in the panel and *Check out this commit* on the desktop, and the three reset modes were named on one side and described on the other. They now share one vocabulary, and a test compares the two catalogues so the next one cannot drift silently.
- **Menu labels no longer start with an emoji.** 127 of them did. An emoji does not inherit the colour of its own row, so it could not follow the hover, disabled or danger state of the text beside it, and a screen reader announced it before the action — *"cherry, Cherry-pick Commit"*. The remaining state markers are monochrome glyphs that follow the text.
- **Action labels are in Title Case, and `…` now means what it usually means**: the action opens an input or a dialog. *Move commit up* and *Copy short hash* were the odd ones out; *Cherry-pick Commit* never asked anything and kept its ellipsis.
- The rail's stash entry is **Stashes**, like the Branches, Remotes, Tags and Worktrees beside it.

### Fixed
- **The Mixed reset described the opposite of what it does.** It read *keeps unstaged changes*, which reads as a promise to leave your work where it is; `--mixed` unstages everything and leaves the working copy alone. It now says *keeps your working copy, resets the index*.
- **`cp.empty` was declared twice** in the string catalogue, with two different texts. A duplicate key is not an error in JavaScript — the last one silently wins — so the command palette had been showing the second one while the first sat unused. A test now fails on any duplicate.

## 1.27.0

### Added
- **A double-click always lands on a branch.** It used to check out a commit and detach HEAD; on a remote branch it looked like it worked, but the sidebar dropped the remote prefix and ran `git checkout test`, quietly taking you to the *local* branch of that name — three commits further on than the row you clicked. Now git decides: a local branch is switched to; a remote branch whose name is free locally gets the branch that tracks it, created without asking; anything else — a name already taken by a branch that has moved on, a bare commit, a tag — asks for a branch name at that commit, with an empty field, because any suggestion would be a guess about what the branch is for.
- **Detached HEAD is reachable from exactly one place**, the context menu's **Check out this commit**, whose label now says what it does. A tag cannot be checked out as a branch at all: its menu entry checks out the *commit* it points at, and double-clicking it offers a branch there. This reverses the tag checkout added in 1.23.0.
- **Edit the message of any commit, not just the last one.** Clicking the message in the commit panel opened an editor when the commit was the tip of the branch, and did nothing at all otherwise — the text of a commit four back looked exactly the same, with no hint that anything was possible. It is now the same gesture everywhere: click, type, confirm. On the tip that is still `commit --amend`; behind it, the range is replayed with a reword step, which is what the context menu's *Edit message* already did through a modal prompt.
- **The panel says what the edit costs before you start.** Hovering the message of an older commit reads *rewrites 4 commits*, and the confirm button says **Rewrite Message** rather than *Update Message*, with the count repeated beside it. Rewording anything but the tip gives every commit after it a new SHA, which needs a force push on a published branch — that was never stated anywhere.
- **Commits that cannot be reworded no longer look like they can.** A merge commit behind the tip (a linear replay would drop one of its sides), the very first commit (no parent to rebase from) and a commit that is not in the current branch's history are all left as plain text. The last one mattered most: the reword builds its sequence with `git log <parent>..HEAD`, so a commit living only on another branch would have rewritten a range that does not contain it.

### Fixed
- **The commit panel flashed open when double-clicking a branch chip.** The browser sends click, click, dblclick, and only the last was being stopped, so the first reached the commit row underneath and selected it on the way to the checkout. A single click on a chip no longer selects the commit under it.
- **Submenus closed themselves under the cursor.** Reaching one of the three Reset modes, or a Delete variant, made the submenu disappear as if the pointer had left the menu. Two causes: a sibling row of the parent menu closed it instantly, so entries you had to move diagonally to reach were unreachable; and the same code renders both menus, so hovering a submenu entry took the "close the open submenu" branch — closing itself.
- **Auto-stash covers every way of arriving on a branch** — switching, creating a tracking branch, creating a branch at a commit — instead of only the plain checkout it was written for.

### Changed
- **Recompose a commit with AI now reviews in the same place.** It used to prefill the inline editor for the tip and open a modal prompt for anything else; both go through the inline editor now.

## 1.26.0

### Fixed
- **The app ran a different git than your terminal.** Launched from the Dock or the Finder, it does not inherit the shell's PATH — it gets `/usr/bin:/bin:/usr/sbin:/sbin` — so on macOS it used Apple's git 2.39 even for someone whose terminal has Homebrew's newer one first on PATH. Every git call went through that resolution. The login shell's PATH is now read back at startup, the binary resolved once to an absolute path, and every call uses that one.
- **The "git is too old" notice named a version you could not find.** It reported the git *the app* was using while `git --version` in the terminal answered something else, with nothing to reconcile the two. Both the notice and Settings → Git now show the path beside the version — *git 2.39.3 — /usr/bin/git* — and how it was chosen.

### Added
- **A git binary path in Settings → Git**, for forcing a specific one. It is checked when you apply it: the version and path shown update without a restart, and a binary that will not run says so instead of quietly falling back.

## 1.25.0

### Added
- **Start a pull request from the branch you are looking at.** It lives in the branch menu now — in the sidebar, on a graph chip, above the staging files — and the row says which way it runs: *Push "feature/x" and start a Pull Request to origin/main*. Which branch is the source and which is the target is worked out rather than assumed: the target must already exist on the remote, nothing is ever proposed *out of* the default branch, and right-clicking another branch while you are standing on the trunk makes that branch the source rather than the target. Where no sensible request exists, no row appears.
- **Copy the link to a branch or to a commit** — the entries that only knew how to open them in a browser now have a counterpart that puts the URL on the clipboard.
- **Create an annotated tag** from a commit, alongside the lightweight one.
- **Delete both ends of a branch** — the local one, its published counterpart, or the pair in a single confirmation. Reaching the remote side used to mean finding its row in the REMOTE section.

### Fixed
- **Creating a pull request never worked.** GitHub cannot open a request on a branch it has never received, and the app sent one without pushing first, so on an unpublished branch the answer was a bare *Validation Failed* with nothing saying what to do. The branch is now pushed as part of the action — the menu row says so, and the composer says so again before you confirm. When GitHub still refuses, the reason comes through: the useful half of its answer was in a field the app never read, so *Validation Failed* now reads *Validation Failed (No commits between main and feature/x)*.

### Changed
- **The branch menu is one menu, wherever you open it.** The graph built its own, shorter version: a chip offered checkout, merge and rebase while push, rename, delete, compare and the rest never appeared, even though the app could do all of them. Chips and sidebar rows now show the same thing.
- **It is grouped by what an action is for** — go there, sync it, fold it in, change it, the commit it points at, look at it — instead of by which part of the code produced the row, which had scattered the same idea across the list. Copying and comparing are one entry each, holding both the branch's and the commit's variants.
- **It fits on the screen.** Rows are 23px instead of 27, and only variants of a single idea fold away, so every daily action stays one click. The menu had reached the point of scrolling.

### Removed
- **Fetch** leaves the branch menu: it acts on the repository, not on the branch you right-clicked, and it already has the toolbar and the Pull split-button.
- **Pin to Graph Edge** never pinned anything. The set of pinned branches was stored and read back to draw a checkmark and a badge; no layout code had ever heard of it. Favorites already covers keeping a branch in view.
- **Switch to Commit** and **Cherry-pick** no longer show on the tip of the branch you are on — there they would detach HEAD where you already are, or pick a commit onto itself. Cherry-pick had been sitting there permanently greyed out.

## 1.24.1

### Fixed
- **The line numbers beside the merged output were wrong** in the conflict resolver as soon as that output ran past the pane. Only its text column scrolled; the gutter stayed pinned at the top, so every number faced the wrong line — in the one place where you check a merge before saving it. It now follows the text, the way the two source panes already follow each other.
- **Selecting a merge commit left the detail panel reading "Loading…"** for as long as it stayed selected. git lists no file for a merge, and the empty result was rendered as if the list were still loading. Empty and loading are separate states now, and the empty one says why there is nothing to show.
- **A French label in the interactive rebase** — the line above the message box when squashing or rewording a commit — in an interface that ships in English.

## 1.24.0

### Changed
- **The interface is English throughout.** French had survived in the interactive rebase editor ("Lancer le rebase", "Annuler", "depuis"), the commit detail, the file history, the conflict panel, the branch comparison and the graph's column menu — even though the app has shipped English-only for a while. Dates follow: they were formatted in French (`10 juin 2026`) whatever the interface language, and now read `Jun 10, 2026`.

### Fixed
- **Three buttons and messages rendered empty.** The PR modal's Close button, the Command Palette's "no matching command" line and the toast after aborting a merge all looked up a translation that had never been defined, so they displayed nothing at all.
- **The file history crashed** as soon as a blame pane had nothing to show — it called the translation helper without it being in scope.
- **git's output no longer depends on your system language.** Every git invocation now runs with a fixed locale, so its error messages reach the interface in English, and no part of the app matches a translated string any more. One such match had shipped: the "no upstream branch" detection tested a French sentence, which was dead code anyway.

### Added
- **A one-time notice when git is too old** for conflict prediction. That feature needs `git merge-tree --merge-base=…`, added in git 2.40; on an older git — macOS still ships 2.39 — the prediction silently returned nothing, so the warning before a merge, rebase, cherry-pick or revert simply never appeared and nothing said why. Everything else works from git 2.28 on.

## 1.23.0

### Added
- **Check out a tag** — double-click it in the sidebar, or pick Checkout from its context menu. HEAD ends up detached, which the confirmation message spells out.
- **Prune stale tracking refs** from a remote's context menu. Pruning the remote also leaves local branches whose upstream is gone, so the same action offers to delete those in one go.
- **Partial stashes** — the **+** on the stash section asks what to take: everything, the index only, or only what isn't staged.
- **Rename a stash** from its context menu. git has no rename, so the entry is re-stored under the new label and moves to the top of the stack — the prompt says so.
- **Default remote, per repository** — mark one from its context menu (it then carries a badge) and push, pull, branch publishing and tag actions all target it. Stored as `gitvertex.defaultRemote` in the repository's own git config, so it stays readable from the command line.

### Fixed
- **Double-clicking a tag did nothing** — unlike a branch or a commit row — and no menu entry offered checkout either, so the action was unreachable from the UI.
- With several remotes configured, push, branch publishing and tag actions silently assumed `origin` instead of the repository's chosen remote.
- The stash list showed the commit subject rather than the reflog message, so a renamed stash would have kept its old label.

## 1.22.0

### Added
- **Pull button dropdown** — the chevron next to Pull now opens a menu: **Fetch All**, **Pull (fast-forward if possible)**, **Pull (fast-forward only)**, **Pull (rebase)**. Whichever you pick becomes what the main button does, and is remembered across restarts. Pull previously always ran a bare `git pull`, leaving the strategy up to your git config.

### Fixed
- **The command palette (⌘P) crashed to a black screen** every time it was opened — an internationalization pass had left it referencing undefined variables, and no error boundary caught the render crash.
- **Branches sharing a name across remotes** were both shown under their bare name, so `origin/main` and `archive/main` appeared as two indistinguishable rows. They now show their remote prefix, but only when the name actually collides.

## 1.21.1

### Fixed
- **Accessibility** — every icon-only button now carries an accessible label, so screen readers announce what it does instead of reading an unlabelled control. A test now fails the build if a new unlabelled button slips in.

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
- **Clone modal**: provider nav (Clone with URL / GitHub.com), Where-to-clone field with Browse, searchable remote-repo list, Shallow Clone and Sparse Checkout options (clones to the chosen location).
- **Init modal**: Local Only (name, location, branch, optional .gitignore + license, LFS) and GitHub.com (create the remote repo + clone).

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
- **Release notes on demand** — open the release notes anytime from Resources, with an "Open in browser" link.

### Changed
- The home is a named, non-permanent tab (🏠): opening a repository from it closes it; opening a non-repo view (release notes) keeps it, before it in the tab bar (opening order). The repo sidebar and activity bar are hidden on the home.

## 1.13.1

### Fixed
- The "What's new" release-notes view is now a normal, non-blocking tab: you can open a repository without closing it, keep it in the background, and close it by its × (no more "C'est parti" button, and the repo's sidebar/toolbar are no longer reachable behind it).

## 1.13.0

### Changed
- **Unified graph context menu** — right-clicking a local branch chip now opens the same menu as its tip commit (branch actions + commit actions); a non-tip commit keeps the commit-only menu.
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
