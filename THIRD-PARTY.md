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
