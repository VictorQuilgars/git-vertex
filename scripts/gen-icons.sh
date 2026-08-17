#!/usr/bin/env bash
# Rebuild resources/icon.icns, icon.ico and icon.png from the two SVG masters.
#
# There are two masters on purpose. The full drawing carries the dotted iris
# commits, which are the half of the mark that says "the model proposed this and
# you have not applied it" — but their stroke is 9 units on a 416-unit mark, so
# below roughly 72px they go sub-pixel and the node turns to grey mush. Every
# entry at or under 32px therefore comes from icon-small.svg, which drops them.
#
# Scaling one SVG to every size, which is what the old recipe did, produced a
# 16px icon that was a smear.
#
#   ./scripts/gen-icons.sh
#
# Needs rsvg-convert (brew install librsvg), iconutil (Xcode) and Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."

BIG=resources/icon.svg
SMALL=resources/icon-small.svg
PY=${PY:-/opt/anaconda3/bin/python}

for f in "$BIG" "$SMALL"; do [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }; done
command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found" >&2; exit 1; }

# Which master each size comes from.
src_for() { [ "$1" -le 32 ] && echo "$SMALL" || echo "$BIG"; }

echo "── iconset ──"
rm -rf resources/icon.iconset && mkdir -p resources/icon.iconset
for s in 16 32 64 128 256 512 1024; do
  src=$(src_for "$s")
  rsvg-convert -w "$s" -h "$s" "$src" -o "resources/icon.iconset/icon_${s}x${s}.png"
  printf '  %5s  %s\n' "${s}px" "$src"
done
# The @2x entries are the next size up, and are drawn at that size — so a
# 16x16@2x is really the 32px art, not the 16px art doubled.
cp resources/icon.iconset/icon_32x32.png     resources/icon.iconset/icon_16x16@2x.png
cp resources/icon.iconset/icon_64x64.png     resources/icon.iconset/icon_32x32@2x.png
cp resources/icon.iconset/icon_256x256.png   resources/icon.iconset/icon_128x128@2x.png
cp resources/icon.iconset/icon_512x512.png   resources/icon.iconset/icon_256x256@2x.png
cp resources/icon.iconset/icon_1024x1024.png resources/icon.iconset/icon_512x512@2x.png

iconutil -c icns resources/icon.iconset -o resources/icon.icns
cp resources/icon.iconset/icon_512x512.png resources/icon.png
echo "── icns + png ──"

echo "── ico ──"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for s in 16 24 32 48 64 128 256; do
  rsvg-convert -w "$s" -h "$s" "$(src_for "$s")" -o "$TMP/icon_$s.png"
done
"$PY" - "$TMP" <<'PYEOF'
import sys, os
from PIL import Image
tmp = sys.argv[1]
sizes = [16, 24, 32, 48, 64, 128, 256]
# Hand Pillow one drawing PER SIZE, via append_images. Given a single image it
# builds every entry by downscaling that one, which is what this block used to
# do — the loop above rendered each size from the right master and then all but
# the 256 were thrown away. The 16px entry came out as the full drawing shrunk,
# at 5.5% ink coverage against the small cut's 14.8%: the exact smear the two
# masters exist to prevent, and it shipped that way.
imgs = [Image.open(os.path.join(tmp, f"icon_{s}.png")).convert("RGBA") for s in sizes]
imgs[-1].save("resources/icon.ico", format="ICO",
              sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
PYEOF

echo "── extension ──"
# The VS Code extension has its OWN icon file, and nothing regenerated it: it
# was still the original green-and-blue mark from "Initial release", two
# generations behind — it had missed the aqua/iris palette and then the
# achromatic one. The Marketplace listing is the first thing anyone sees of
# this product, so it comes off the same master as everything else now.
#
# 256 rather than the 128 the Marketplace asks for: the listing page draws it
# at 128 CSS pixels on a retina display, and a 128 file is soft there.
rsvg-convert -w 256 -h 256 "$BIG" -o vscode-extension/images/icon.png
printf '  %5s  %s\n' "256px" "$BIG"

ls -l resources/icon.icns resources/icon.ico resources/icon.png \
      vscode-extension/images/icon.png | awk '{printf "  %-34s %8d o\n", $9, $5}'
