# git-vertex-mcp

Local MCP server over your Git repositories — the Git Vertex companion for
AI agents. Connect Claude Code, Cursor, Copilot or any MCP client to your
real Git history (status, commit graph, branches, diffs, blame) **and let
it help resolve conflicts**: a structured view of the ongoing merge/rebase
with both sides labelled by branch and commit subject, surgical per-file
resolution, continue/abort. Runs entirely on your machine over stdio. No
cloud, no telemetry — and writes never touch history.

## Requirements

**git 2.28 or newer.** The server itself needs nothing more recent; the 2.40
recommendation elsewhere in the project only applies to the conflict prediction,
which lives in the app and the extension, not here.

## Install & connect

```bash
# Claude Code
claude mcp add git-vertex -- npx -y git-vertex-mcp

# or from a checkout of this repo
claude mcp add git-vertex -- node /path/to/git-vertex/mcp/bin/gv-mcp.mjs
```

For other clients (Cursor, etc.), register the command `npx -y git-vertex-mcp`
as a stdio MCP server.

By default every tool operates on the client's current working directory.
Point it elsewhere per call (each tool takes a `repo` path) or globally with
the `GV_REPO` environment variable.

## Tools

| Tool | What it returns |
|---|---|
| `git_status` | Current branch, upstream ahead/behind, staged/unstaged/untracked/conflicted files |
| `git_log` | Compact history (hash, parents, author, date, refs, subject) with author/date/path filters |
| `git_branches` | Local + remote branches, tip, tracking state, current branch marked |
| `git_diff` | Staged, unstaged, or `<a>..<b>` diff — full patch or `--stat` summary |
| `git_show` | One commit: metadata, message, per-file +/- stats, optional patch |
| `git_blame` | Per-line last-change attribution for a file or line range |
| `predict_conflicts` | DRY-RUN merge (`git merge-tree`): would merging X into Y conflict, and on which files — without touching the working tree or any ref |
| `git_pickaxe` | The commits that added/removed a string or regex (`git log -S/-G`) — "when was this function introduced/deleted?" |
| `find_lost_work` | HEAD reflog + dangling commits: recover work "lost" to resets, rebases or deleted branches |
| `git_bisect` ✏️ | Drive a bisect session (start/good/bad/skip/reset/log) — agents build, test and judge each step to find the culprit commit |
| `git_conflicts` | Ongoing merge/rebase/cherry-pick/revert: operation kind, both sides labelled (branch + commit subject — during a rebase, HEAD is the NEW BASE), conflicted files, optional marker-annotated file content |
| `resolve_conflict` ✏️ | Write the resolved content of ONE conflicted file and stage it — refused if the file isn't conflicted or if markers remain |
| `continue_operation` ✏️ | `git <op> --continue` once everything is resolved (editor suppressed) |
| `abort_operation` ✏️ | `git <op> --abort` — restore the pre-operation state |
| `open_in_git_vertex` 🖥️ | Open the Git Vertex desktop app on the repo: commit graph, a commit's details, or the 3-way conflict resolver — optionally with an agent-proposed resolution preloaded for the user to review |
| `propose_commit` 🖥️ | Open the staging view with an agent-proposed commit message preloaded (and an optional proposed file selection) — the user reviews, stages and commits themselves |
| `propose_rebase_plan` 🖥️ | Open the visual interactive-rebase editor with an agent-proposed plan (squash/fixup/reword/drop + new messages) preloaded — the user reviews and launches it themselves |
| `generate_commit_message` 🎲 | Draft a commit message from the staged diff using the MCP **client's own LLM** (sampling) — no API key on this server, works with any provider; falls back to returning the diff if the client doesn't support sampling |

## Resources

The status, the history and the staged diff are also offered as **resources**,
so a client can pin them to the conversation without a tool call — Cline,
Continue, Zed and others attach them directly. They read the default
repository (`GV_REPO`, or the directory the client started the server in).

| URI | What it holds |
|---|---|
| `git://status` | Same text as `git_status` |
| `git://log` | Same text as `git_log` with its defaults: the last 50 commits, all branches |
| `git://diff/staged` | The staged patch (`git diff --cached`) |

All three are **subscribable**: while a client is subscribed, the server re-reads
the resource every 2 seconds and sends `notifications/resources/updated` when its
text has changed — not merely when a file was touched. Nothing is polled while
nothing is subscribed, and the reads take no optional lock, so they cannot make
your own `git add` fail on `index.lock`. `GV_MCP_RESOURCE_POLL_MS` changes the
interval.

## Prompts

Three prompts that MCP clients list as slash commands. Each gathers the git
material itself and hands it to the client's own model, so they work with any
provider and in a client that never calls a tool.

| Prompt | Arguments | What it asks for |
|---|---|---|
| `/review-branch` | `branch` (default: current), `base` (default: origin's default branch, else `main`/`master`), `repo` | A code review of the branch's commits and of its diff since it left the base |
| `/release-notes` | `from` (default: the latest tag before `to`), `to` (default: `HEAD`), `repo` | User-facing release notes grouped as Added / Changed / Fixed / Removed |
| `/explain-commit` | `ref` (required), `repo` | A plain-language explanation of one commit: what, why, how, what to watch |

## Design notes

- **Writes are surgical and opt-out** — the only mutating tools (✏️) operate
  on the CURRENT conflict state: they can write a conflicted file, stage it,
  and continue/abort the operation. They can never rewrite history, push, or
  touch a non-conflicted file. Run with `--read-only` (or `GV_MCP_READONLY=1`)
  to disable them entirely: your repository, your rules.
- **The user confirms writes, even without the app** — when the MCP client
  supports elicitation, `resolve_conflict`, `continue_operation` and
  `abort_operation` ask the user through the client before acting (the
  resolution is previewed in the question); if the user does not tick
  "Go ahead", nothing is changed. A client without elicitation is never asked
  and the tools behave as before, relying on a confirmation in chat. If your
  client already puts every tool call behind a permission prompt, run with
  `--no-elicitation` (or `GV_MCP_NO_ELICITATION=1`) not to be asked twice.
- **The agent proposes, the human disposes** — the 🖥️ tools hand off to the
  Git Vertex desktop app (via the `gitgui://` scheme, so the app must be
  installed) with the agent's proposal preloaded into the real UI. They write
  nothing to the repository: no staging, no commit, no rewrite happens until
  the user acts in the app.
- **Provider-agnostic AI** — `generate_commit_message` uses MCP sampling:
  the text is generated by whatever model the *client* runs (Claude, GPT,
  Gemini, a local model…). This server needs no AI credentials at all.
- Outputs are truncated at 24k chars to stay friendly to model context windows.
- Ref/path/author arguments are validated so they can't smuggle git options.

## Development

```bash
cd mcp
npm install
npm run dev        # tsx, stdio on the terminal
npm run build      # → dist/
npm test           # end-to-end suite: builds, regenerates fixture repos
                   # (tests/fixtures/, git-ignored) and drives every tool
                   # through a real stdio MCP client (tests/run-tests.mjs)
```

The suite covers all tools, `--read-only`, `GV_REPO`, argv-injection and
path-traversal guards, a full bisect session, MCP sampling and elicitation
(simulated client, including a client without either), the three resources
and their subscriptions, and the three prompts. The desktop-handoff happy
paths (`gitgui://`) are validation-only — they would open the app. Two
`locale fr` tests start the server under a French git locale and expect
English output.
