# Third-party notices

Assets in this repository that belong to someone else, and the notices their
licences require us to carry. Adding a third-party asset means adding it here
in the same commit — for most of these licences the notice is not a courtesy,
it is the condition on being allowed to ship the file at all.

Everything else in `src/renderer/src/components/Icon/icons/` is ours, drawn to
the mark's own geometry, and covered by this project's licence (`LICENSE.md`).

---

## Lucide — `icons/rocket.svg`

The Launchpad icon is Lucide's `rocket`, taken unmodified apart from dropping
the `width`/`height`/`stroke-width` attributes, which `components/Icon` sets
itself so a shape never carries its own weight.

Source: <https://lucide.dev> · <https://github.com/lucide-icons/lucide>

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## Trademarks displayed, not licensed

`components/BrandMark` holds the GitHub, Git and Visual Studio Code marks. Those
are **trademarks**, not assets under an open-source licence: they are shown to
say "this works with their product", which is nominative use. They may not be
redrawn, restyled beyond what their owner allows, or used as our own product
icon. The conditions are written out in that file.

---

## A licence that ruled an option out

Iconsax was considered for the same icon and rejected. Its licence forbids
redistributing icon files individually — *"FORBIDDEN! (Neither loose nor in
packs)"*, and for code *"Only as PART of code (w/ notice)… NO loose files"*.
This repository is public and its icon set is deliberately a folder of loose
`.svg` files, so Iconsax icons cannot live in it. The only compliant route
would be inlining them into components, which is exactly the arrangement the
icon folder exists to replace.

Source: <https://docs.iconsax.io/license-and-terms/license>

---

## VS Code themes — the `[data-theme]` blocks in `tokens.css`

Thirty published themes, each reduced to this project's own 24 seeds. The
palettes are theirs; the mapping onto our roles, and the contrast repairs it
makes, are ours. No code, no icon and no name is used as our own.

Each licence was verified by reading the licence FILE, not the declared field.
`SEE LICENSE IN LICENSE.txt` is an indirection rather than a restriction, and
it hides both answers: Microsoft's built-in themes are MIT that way, while
another theme's file opens with the MIT sentence and then forbids
redistribution outright. The generator refuses that one.

The version below is pinned: an upstream release can change a licence, so the
version named here is the version the palette came from.

| Extension | Version | Licence | Themes |
|---|---|---|---|
| [`zhuangtongfa.material-theme`](https://open-vsx.org/extension/zhuangtongfa/material-theme) | 3.20.2 | MIT | One Dark Pro |
| [`Catppuccin.catppuccin-vsc`](https://open-vsx.org/extension/Catppuccin/catppuccin-vsc) | 3.19.0 | MIT | Catppuccin Frappé, Catppuccin Latte |
| [`gitpod.gitpod-theme`](https://open-vsx.org/extension/gitpod/gitpod-theme) | 0.0.2 | MIT | Gitpod Dark, Gitpod Light |
| [`dracula-theme.theme-dracula`](https://open-vsx.org/extension/dracula-theme/theme-dracula) | 2.25.1 | MIT | Dracula Theme |
| [`GitHub.github-vscode-theme`](https://open-vsx.org/extension/GitHub/github-vscode-theme) | 6.3.5 | MIT | GitHub Dark, GitHub Light |
| [`vscode.theme-monokai-dimmed`](https://open-vsx.org/extension/vscode/theme-monokai-dimmed) | 1.95.3 | MIT | Monokai Dimmed |
| [`vscode.theme-monokai`](https://open-vsx.org/extension/vscode/theme-monokai) | 1.95.3 | MIT | Monokai |
| [`vscode.theme-defaults`](https://open-vsx.org/extension/vscode/theme-defaults) | 1.95.3 | MIT | Dark+, Light+ |
| [`vscode.theme-red`](https://open-vsx.org/extension/vscode/theme-red) | 1.95.3 | MIT | Red |
| [`vscode.theme-kimbie-dark`](https://open-vsx.org/extension/vscode/theme-kimbie-dark) | 1.95.3 | MIT | Kimbie Dark |
| [`vscode.theme-solarized-dark`](https://open-vsx.org/extension/vscode/theme-solarized-dark) | 1.95.3 | MIT | Solarized Dark |
| [`jdinhlife.gruvbox`](https://open-vsx.org/extension/jdinhlife/gruvbox) | 1.29.1 | MIT | Gruvbox Dark Hard, Gruvbox Light Hard |
| [`teabyii.ayu`](https://open-vsx.org/extension/teabyii/ayu) | 1.1.12 | MIT | Ayu Dark, Ayu Light |
| [`akamud.vscode-theme-onedark`](https://open-vsx.org/extension/akamud/vscode-theme-onedark) | 2.3.0 | MIT | Atom One Dark |
| [`enkia.tokyo-night`](https://open-vsx.org/extension/enkia/tokyo-night) | 1.1.2 | MIT | Tokyo Night, Tokyo Night Light |
| [`mvllow.rose-pine`](https://open-vsx.org/extension/mvllow/rose-pine) | 2.15.2 | MIT | Rosé Pine |
| [`sdras.night-owl`](https://open-vsx.org/extension/sdras/night-owl) | 2.1.1 | MIT | Night Owl |
| [`Equinusocio.vsc-community-material-theme`](https://open-vsx.org/extension/Equinusocio/vsc-community-material-theme) | 1.4.6 | Apache-2.0 | Community Material Theme |
| [`ahmadawais.shades-of-purple`](https://open-vsx.org/extension/ahmadawais/shades-of-purple) | 7.3.6 | MIT | Shades of Purple |
| [`Dracula-2.dracula-2`](https://open-vsx.org/extension/Dracula-2/dracula-2) | 0.3.8 | MIT | Darcula |
| [`ms-vscode.powershell`](https://open-vsx.org/extension/ms-vscode/powershell) | 2025.4.0 | MIT | PowerShell ISE |
| [`vscode.theme-quietlight`](https://open-vsx.org/extension/vscode/theme-quietlight) | 1.95.3 | MIT | Quiet Light |
| [`vscode.theme-solarized-light`](https://open-vsx.org/extension/vscode/theme-solarized-light) | 1.95.3 | MIT | Solarized Light |

Copyright in each palette remains with its author. The full licence text of
each is served by Open VSX alongside the extension, and is reproduced in the
extension's own repository, linked above.
