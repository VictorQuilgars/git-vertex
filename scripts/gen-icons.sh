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
# Pillow builds every entry by downscaling the one image it is given, so the
# small entries are handed the small-cut art rather than the full one.
Image.open(os.path.join(tmp, "icon_256.png")).convert("RGBA").save(
    "resources/icon.ico", format="ICO", sizes=[(s, s) for s in sizes])
PYEOF

ls -l resources/icon.icns resources/icon.ico resources/icon.png | awk '{printf "  %-24s %8d o\n", $9, $5}'
