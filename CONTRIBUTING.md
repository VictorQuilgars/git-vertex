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
npm run dev        # desktop app
npm test           # test suite
```

The VS Code extension lives in [`vscode-extension/`](vscode-extension/), the
terminal UI in [`cli/`](cli/) and the MCP server in [`mcp/`](mcp/) — each with
its own `package.json` and README.

## Pull requests

- Open an issue first for anything bigger than a small fix, so we can discuss
  the approach before you invest time in it.
- Keep PRs focused: one change per PR.
- Make sure `npm test` and `npm run build` pass.
- Write commit messages in English (conventional-commits style: `feat:`,
  `fix:`, `docs:`…).

## License of contributions

Git Vertex is licensed under the [FSL-1.1-MIT](LICENSE.md). By submitting a
contribution you agree that it is provided under the same license, and you
grant the project maintainer the rights needed to continue licensing and
distributing the project, including in future releases under different terms.
