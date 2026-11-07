"""Make mise's conda-forge Poppler find its CJK data. Run by mise after it installs `conda:poppler` (mise.toml).

The words of a text PDF come from `pdftotext -bbox`, so Poppler's version and CJK data decide the tables
(ingestion/lib/poppler.py). libpoppler keeps its data directory in a fixed-length string. mise's conda backend
writes the install path there and fills the rest with NULs, which also cuts the `/cMap`-style suffixes, so
Japanese CID fonts report "Missing language pack" and their words are lost. The NULs are replaced here with
`/`, which names the same directory. Running it again changes nothing. On macOS the edited library is
signed again (ad hoc, as conda-forge ships it): arm64 kills a process that loads a library whose signature broke.
"""
import os
import subprocess
import sys
from pathlib import Path

root = Path(os.environ.get('MISE_TOOL_INSTALL_PATH') or sys.argv[1])
datadir = f'{root}/share/poppler'.encode()
libraries = [path for pattern in ('lib/libpoppler.so.*', 'lib/libpoppler.*.dylib')
             for path in root.glob(pattern) if not path.is_symlink()]
patched = fixed = 0
for library in libraries:
    data = bytearray(library.read_bytes())
    start = data.find(datadir + b'\0')
    if start < 0:
        fixed += datadir + b'/' in data
        continue
    end = start + len(datadir)
    while data[end] == 0:
        end += 1
    width = end - start - 1  # the last NUL ends the string
    data[start:start + width] = datadir + b'/' * (width - len(datadir))
    library.write_bytes(bytes(data))
    if sys.platform == 'darwin':
        subprocess.run(['codesign', '--force', '--sign', '-', str(library)], check=True)
    patched += 1
if patched + fixed != 1:
    sys.exit(f'{root}: expected one libpoppler holding {datadir.decode()}, found {patched} to patch and {fixed} patched')
if not (root / 'share/poppler/cMap/Adobe-Japan1').is_dir():
    sys.exit(f'{root}: no Japanese CJK data (share/poppler/cMap/Adobe-Japan1)')
