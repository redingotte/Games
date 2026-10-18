#!/usr/bin/env bash
# Build upload-ready zips for every game (or the ones given as arguments).
#
#   scripts/package.sh                 -> all games
#   scripts/package.sh sky-stack       -> one game
#
# Output:
#   dist/itch/<game>.zip         plain HTML5 build (itch.io, own site, Newgrounds…)
#   dist/crazygames/<game>.zip   same build + CrazyGames SDK v3 script tag
#
# Games reference the shared kit as ../../shared/; the build copies it next
# to index.html and rewrites the paths so each zip is self-contained.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
SDK_TAG='<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is required (apt-get install zip)" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  GAMES=("$@")
else
  GAMES=()
  for d in "$ROOT"/games/*/; do GAMES+=("$(basename "$d")"); done
fi

for target in itch crazygames; do
  mkdir -p "$DIST/$target"
done

for game in "${GAMES[@]}"; do
  src="$ROOT/games/$game"
  [ -f "$src/index.html" ] || { echo "skip $game (no index.html)"; continue; }

  for target in itch crazygames; do
    out="$DIST/$target/$game"
    rm -rf "$out" "$DIST/$target/$game.zip"
    mkdir -p "$out"
    # Game files, minus store/marketing material that should not ship.
    (cd "$src" && find . -type f ! -name 'store.md' ! -path './marketing/*' -print0 |
      xargs -0 -I{} cp --parents {} "$out/")
    cp -r "$ROOT/shared" "$out/shared"
    sed -i 's#\.\./\.\./shared/#shared/#g' "$out/index.html"
    if [ "$target" = "crazygames" ]; then
      sed -i "s#<!-- PLATFORM_SDK -->#$SDK_TAG#" "$out/index.html"
    else
      sed -i 's#<!-- PLATFORM_SDK -->##' "$out/index.html"
    fi
    (cd "$out" && zip -qr "../$game.zip" .)
    echo "built dist/$target/$game.zip"
  done
done
