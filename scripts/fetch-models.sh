#!/usr/bin/env bash
# Fetch + repackage Vosk small models for on-device Smart Follow.
# vosk-browser loads a .tar.gz whose ROOT contains the model files (am/, conf/, graph/, ...).
# Models are large (~40-50MB each) and gitignored (public/models/) — which is why this also runs
# on Vercel as part of `npm run vercel-build`: a clean clone has no models, and without them the
# app 404s on the model, `load()` throws before `startMic()`, and the mic is never even requested.
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="public/models"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Vercel's build image is Amazon Linux 2023, where `unzip` is not guaranteed. python3 always is
# (it backs the Python runtime), and its zipfile module is enough to unpack a model.
unpack() {
  local zip="$1" dest="$2"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$zip" -d "$dest"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e "$zip" "$dest"
  else
    echo "✗ need either unzip or python3 to unpack $zip" >&2
    exit 1
  fi
}

fetch() {
  local name="$1" url="$2"
  local out="$DEST/$name.tar.gz"
  if [ -f "$out" ]; then echo "✓ $name already present ($out)"; return; fi
  echo "↓ downloading $name …"
  curl -fsSL "$url" -o "$TMP/$name.zip"
  echo "  unpacking …"
  unpack "$TMP/$name.zip" "$TMP"
  echo "  repackaging → $out"
  tar -czf "$out" -C "$TMP/$name" .
  echo "✓ $name ready ($(du -h "$out" | cut -f1))"
}

fetch "vosk-model-small-en-us-0.15" "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
fetch "vosk-model-small-pl-0.22"    "https://alphacephei.com/vosk/models/vosk-model-small-pl-0.22.zip"

echo "Done. Models in $DEST/"
