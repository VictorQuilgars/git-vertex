<p align="center">
  <img src="resources/icon.png" width="128" alt="Git Vertex logo"/>
</p>

<h1 align="center">Git Vertex</h1>

<p align="center">
  A fast, modern Git GUI for developers.<br/>
  Visualize branches, stage changes, and manage commits with a clean interface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey" alt="macOS"/>
  <img src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React-61DAFB" alt="Electron + React"/>
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6" alt="TypeScript"/>
</p>

---

## Features

- **Commit graph** — visualize branches and merges in a modern, curved graph
- **Stage & commit** — stage individual files or hunks, amend commits
- **Interactive rebase** — reorder, squash, drop commits visually
- **Push & pull** — push to any remote and branch with custom options
- **AI commit messages** — generate commit messages with Anthropic, Google, Groq or OpenAI
- **Branch management** — create, checkout, cherry-pick, revert, reset
- **Tags** — create and visualize tags directly in the graph

## Stack

- [Electron](https://www.electronjs.org/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [electron-vite](https://electron-vite.org/) for the build system
- [simple-git](https://github.com/steveukx/git-js) for git operations

## Getting started

```bash
git clone https://github.com/VictorQuilgars/git-vertex.git
cd git-vertex
npm install
npm run dev
```

## Build

```bash
npm run package
```

Outputs a `.dmg` installer in `dist/`.

## License

MIT
