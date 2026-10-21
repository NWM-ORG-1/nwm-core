#!/usr/bin/env bash
# Re-creates the subset HUD fonts in src/assets/fonts from the `geist` package.
# Needs fonttools + brotli (pip install fonttools brotli). Geist is SIL OFL 1.1 with
# no Reserved Font Name, so subsetting is allowed.
#   mono: HUD labels, figures, codes → ASCII, Latin-1, punctuation, arrows, ▲▼
#   pixel: rank numbers, beat codes on covers, 404 → space, punctuation, digits, A–Z
set -euo pipefail
cd "$(dirname "$0")/.."
src=node_modules/geist/dist/fonts
out=src/assets/fonts

pyftsubset "$src/geist-mono/GeistMono-Variable.woff2" \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-203A,U+20AC,U+2190-2199,U+2212,U+25B2,U+25BC" \
  --flavor=woff2 --output-file="$out/GeistMono-Variable.subset.woff2"

pyftsubset "$src/geist-pixel/GeistPixel-Square.woff2" \
  --unicodes="U+0020-005A" \
  --flavor=woff2 --output-file="$out/GeistPixel-Square.subset.woff2"

ls -l "$out"/*.subset.woff2
