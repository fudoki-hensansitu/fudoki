#!/bin/sh
# ホームの「AI から使う」に載せるデモ動画を、slidex の発表用の録画から書き出す。
# 録画は ChatGPT から風土記の MCP に北区を聞いたもの。冒頭のあいさつに利用者の名前が映るので白で覆う。音声は落とす。
# 使い方: sh brand/home_demo.sh <slidex の apps/studio/src/decks/assets/fudoki-motion-demo.mp4>
set -eu
src=$1
out=$(dirname "$0")/../static/home
mkdir -p "$out"
ffmpeg -v error -y -i "$src" -an \
  -vf "drawbox=x=580:y=448:w=530:h=60:color=0xffffff@1:t=fill:enable='lt(t,4.9)',scale=1280:-2,fps=30" \
  -c:v h264_videotoolbox -b:v 900k -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p -profile:v high -movflags +faststart \
  "$out/demo.mp4"
ffmpeg -v error -y -ss 20 -i "$out/demo.mp4" -frames:v 1 "$out/demo-poster.png"
uv run --no-project --exclude-newer 2026-10-09 --with pillow==12.3.0 python -c "
from PIL import Image; import sys
Image.open(sys.argv[1]).save(sys.argv[2], 'WEBP', quality=72, method=6)" "$out/demo-poster.png" "$out/demo-poster.webp"
rm "$out/demo-poster.png"
