#!/usr/bin/env bash
# Fetch + repackage Vosk small models for on-device Smart Follow.
# vosk-browser loads a .tar.gz whose ROOT contains the model files (am/, conf/, graph/, ...).
# Models are large (~40-50MB each) and gitignored (public/models/).
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="public/models"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  local name="$1" url="$2"
  local out="$DEST/$name.tar.gz"
  if [ -f "$out" ]; then echo "✓ $name already present ($out)"; return; fi
  echo "↓ downloading $name …"
  curl -fsSL "$url" -o "$TMP/$name.zip"
  echo "  unzipping …"
  unzip -q "$TMP/$name.zip" -d "$TMP"
  echo "  repackaging → $out"
  tar -czf "$out" -C "$TMP/$name" .
  echo "✓ $name ready ($(du -h "$out" | cut -f1))"
}

fetch "vosk-model-small-en-us-0.15" "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
fetch "vosk-model-small-pl-0.22"    "https://alphacephei.com/vosk/models/vosk-model-small-pl-0.22.zip"

echo "Done. Models in $DEST/"
