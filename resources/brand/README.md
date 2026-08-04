# Brand assets

Everything here is generated. The two scripts that write it live in
`docs-private/logo-piste-g/` and read their colours from
`src/renderer/src/tokens.css`, so the mark cannot drift from the app's palette.

    cd docs-private/logo-piste-g
    python3 logo.py                       # the symbol, every cut
    /opt/anaconda3/bin/python3 outline.py # the wordmark, type converted to paths
    python3 lockup.py                     # wordmark + lockups

**To change the logo's colours, change the seeds in `tokens.css` and re-run.**
Nothing here is hand-edited.

## Which file goes where

| Context | Dark surface | Light surface |
|---|---|---|
| Anything, full size | `g-mark.svg` | `g-light.svg` |
| Marketplace listing, 128 | `g-marketplace-128.svg` | `g-marketplace-128-light.svg` |
| 32px | `g-32.svg` | `g-32-light.svg` |
| Favicon, 16px | `g-favicon-16.svg` | `g-favicon-16-light.svg` |

These carry their own surface, or adapt on their own:

| File | Use |
|---|---|
| `g-mono.svg` | one ink, inherits `currentColor` — README badge, macOS template glyph |
| `g-toolbar-24.svg` | 24px monochrome, head nodes go solid |
| `g-sidebar-16.svg` | 16px monochrome, silhouette only |
| `g-negative.svg` | knocked out of an aqua fill — sticker, badge, filled button |
| `g-avatar.svg` | round crop for social profiles |
| `g-watermark.svg` | empty states and document backgrounds; set opacity on the `<svg>` |
| `g-tui.txt` | the terminal splash, 256-colour ANSI |

The app icon is not here: it is `resources/icon.svg` (full) and
`resources/icon-small.svg` (16 and 32px cut), built into `.icns`/`.ico`/`.png`
by `scripts/gen-icons.sh`.

## Wordmark and lockups

Type is **converted to outlines** — there is no font dependency, no `@font-face`
and no network fetch. Geologica 600 at -1% tracking, kerned from the font's own
GPOS table (`Ve` alone is -70 units; without it the word gaps after the V).

| File | Use |
|---|---|
| `wordmark.svg` | name alone, where the symbol is already present. Min width 120px |
| `lockup-horizontal.svg` | nav bar, toolbar, installer, footer. Min height 22px |
| `lockup-horizontal-full.svg` | hero, splash, README header — **only at or above 72px** |
| `lockup-vertical.svg` | splash screens, square placements. Min height 64px |

The two horizontal lockups differ by the symbol's detail. Below ~72px the
intermediate commit nodes go sub-pixel, so the lightened one takes over.

Spacing unit is **V**, the vertex diameter: 1 V between symbol and wordmark, 1 V
of clear space all round. Each `viewBox` already *is* the clear-space box, so
dropping a file into a layout gives the right spacing with nothing to measure.

Every file carries `role="img"` and a `<title>`, because a wordmark in SVG is
otherwise silent to a screen reader.
