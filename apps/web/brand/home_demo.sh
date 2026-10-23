#!/bin/sh
# ホームの「AI から使う」に載せるデモ動画を、slidex の発表用の録画から書き出す。
# 録画は ChatGPT から風土記の MCP に北区を聞いたもの。冒頭のあいさつに利用者の名前が映るので白で覆う。音声は落とす。
# 書き出しは macOS の VideoToolbox（h264_videotoolbox）を使う。他の OS では -c:v libx264 -crf 28 に読み替える。
# 使い方: sh brand/home_demo.sh <slidex の apps/studio/src/decks/assets/fudoki-motion-demo.mp4>
set -eu
src=$1
out=$(dirname "$0")/../static/home
mkdir -p "$out"
ffmpeg -v error -y -i "$src" -an \
  -vf "drawbox=x=580:y=448:w=530:h=60:color=0xffffff@1:t=fill:enable='lt(t,4.9)',scale=1280:-2,fps=30" \
  -c:v h264_videotoolbox -b:v 900k -maxrate 1500k -bufsize 3000k -pix_fmt yuv420p -profile:v high -movflags +faststart \
  "$out/demo.mp4"
