# Contributing to Git Vertex

Thanks for your interest in Git Vertex! Bug reports, feature requests and
feedback are all welcome.

## Reporting bugs & requesting features

Please open an [issue](https://github.com/VictorQuilgars/git-vertex/issues)
using the matching template. For bugs, include your OS, the surface you were
using (desktop app, VS Code extension, terminal UI or MCP server) and steps
to reproduce.

## Development setup

```bash
git clone https://github.com/VictorQuilgars/git-vertex.git
cd git-vertex
npm install
```

Every product runs from source in a couple of commands, so you can try your
change for real rather than waiting on a build:

| Product | Run it | Test it |
|---|---|---|
| Desktop app | `npm run dev` | `npm test` |
| VS Code extension | see below | `npm run compile` in `vscode-extension/` |
| Terminal UI | `npm run dev` in `cli/` | `npm run typecheck` in `cli/` |
| MCP server | `npm run dev` in `mcp/` | `npm test` in `mcp/` |

**The VS Code extension** needs both installs — its webview bundle imports
desktop sources, so the root `node_modules` is not optional:

```bash
npm install                      # at the root, if you have not already
cd vscode-extension && npm install
```

Then open `vscode-extension/` in VS Code and press <kbd>F5</kbd> ("Run
Extension"). A second VS Code window opens with the extension loaded from your
working copy.

### GitHub sign-in, when running from source

Signing in with GitHub needs an OAuth client ID and the token-exchange proxy,
which are injected at build time and are **not** part of the repository — see
[`.env.example`](.env.example). Without them the app still runs: the commit
graph, staging, branches, merges, rebases and conflict resolution are all local
git. Only "Sign in with GitHub", and what depends on it (pull requests, "Share
Patch as Link"), will fail.

The same is true of a CI run on a pull request from a fork: GitHub passes no
secrets to it, deliberately. So do not be surprised if sign-in is dead in an
environment you did not configure yourself — nothing is broken.

### git version

git **2.40 or newer** is recommended (2.28 minimum). Predicting conflicts before
a merge or rebase needs `git merge-tree --merge-base`, which arrived in 2.40;
below that the operation runs without its warning. macOS still ships 2.39.

## Pull requests

- Open an issue first for anything bigger than a small fix, so we can discuss
  the approach before you invest time in it.
- Keep PRs focused: one change per PR.
- Write commit messages in English (conventional-commits style: `feat:`,
  `fix:`, `docs:`…).

Opening the PR runs CI: the four products are compiled and their tests run. It
uses no secrets and a read-only token, which is what makes it safe to run
against a fork. On your first PR a maintainer has to approve the run — that is
GitHub's default for new contributors, not a judgement on your change.

That run is the only one there is: CI does not run again on `main` after the
merge, because it would be re-testing the same tree with nothing gated on the
answer. What it does instead is require your branch to be **up to date** with
`main` before it can be merged. So if `main` moves while your PR is open, you
will be asked to pull it in and let the checks run again — that second run is
the one testing what merging actually produces, including the case where your
change and someone else's are each fine alone and broken together.

Merging is done by a maintainer. Two things are reserved to the project owner
regardless: the four `package.json` version files, because bumping one is what
publishes a release under their credentials, and anything under `.github/` or
`scripts/`, because it runs in CI with the repository's secrets. Please don't
include a version bump in a PR — releases are cut separately, see
[RELEASING.md](RELEASING.md).

## License of contributions

Git Vertex is licensed under the [FSL-1.1-MIT](LICENSE.md). By submitting a
contribution you agree that it is provided under the same license, and you
grant the project maintainer the rights needed to continue licensing and
distributing the project, including in future releases under different terms.
