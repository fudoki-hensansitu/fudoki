#!/usr/bin/env bash
# Install the pinned Poppler (pipeline/poppler-version) on Linux and put its tools first on PATH via ~/.local/bin.
#
# The words of a text PDF come from `pdftotext -bbox`, so the Poppler version and its CJK data decide the
# tables: apt's 24.02 without poppler-data drops the words of Japanese CID fonts and reads overprinted digits
# differently, and the tables then differ from the ones saved on the Mac (Homebrew, same version).
# conda-forge's build keeps its data directory in a fixed-length string; after relocation the path is followed
# by NULs, so `<datadir>/cMap` resolves to `<datadir>` and the Japanese mappings are not found. The string is
# padded here with `/` instead, which leaves the same directory.
set -euo pipefail

[[ "$(uname -s)" == Linux ]] || { echo "Linux only. On macOS: brew install poppler && brew pin poppler" >&2; exit 1; }
version="$(tr -d '[:space:]' < "$(dirname "$0")/../poppler-version")"
target="${XDG_DATA_HOME:-$HOME/.local/share}/fudoki/poppler-$version"
bin="$HOME/.local/bin"

if [[ ! -x "$target/bin/pdftotext" ]]; then
  mise install "conda:poppler@$version"
  source="$(mise where "conda:poppler@$version")"
  rm -rf "$target.tmp"
  mkdir -p "$(dirname "$target")"
  cp -a "$source" "$target.tmp"
  python3 - "$source" "$target" "$target.tmp" <<'PY'
import sys
from pathlib import Path

source, target, staging = sys.argv[1], sys.argv[2], Path(sys.argv[3])
old = f'{source}/share/poppler'.encode()
new = f'{target}/share/poppler'.encode()
patched = 0
for library in sorted(staging.glob('lib/libpoppler.so.*')):
    if library.is_symlink():
        continue
    data = bytearray(library.read_bytes())
    start = data.find(old + b'\0')
    if start < 0:
        continue
    end = start + len(old)
    while data[end] == 0:
        end += 1
    width = end - start - 1  # the last NUL ends the string
    if len(new) > width:
        sys.exit(f'{library}: data path longer than the {width} bytes the library holds')
    data[start:start + width] = new + b'/' * (width - len(new))
    library.write_bytes(bytes(data))
    patched += 1
if patched != 1:
    sys.exit(f'expected one libpoppler to patch, patched {patched}')
PY
  mv "$target.tmp" "$target"
fi

mkdir -p "$bin"
for tool in pdftotext pdftoppm pdftocairo pdfinfo pdffonts pdfimages; do
  [[ -x "$target/bin/$tool" ]] && ln -sfn "$target/bin/$tool" "$bin/$tool"
done
"$bin/pdftotext" -v 2>&1 | head -1
