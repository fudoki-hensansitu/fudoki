export const PATTERNS = [
  ['search', '歳出の検索結果'],
  ['chart', '款→項→目のチャート'],
  ['chart-kan', '款で絞ったチャート'],
  ['chart-partial', '取得途中のチャート'],
  ['chart-invalid', '金額欠損のチャート'],
  ['chart-many', '款が14件'],
  ['chart-cities', '2自治体の款'],
  ['chart-compare', '自治体・年度をまたぐ比較'],
  ['detail', '明細・軸ごとの内訳'],
  ['leaf', '末端の明細'],
  ['', 'PDF・出典の各ケース'],
  ['pdf-locations', 'PDFの頁が片方だけ'],
  ['empty', '検索0件'],
  ['loading', '読み込み中'],
  ['error', '初回取得の失敗'],
  ['retry', '追加取得の失敗・再試行'],
  ['race', '遅い応答'],
] as const

export function previewHtml() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>風土記 MCP UI 開発プレビュー</title>
<style>
:root{color-scheme:light dark;--bg:light-dark(#fff,#202020);--fg:light-dark(#181818,#eee);--line:light-dark(#ddd,#444);--frame-border:light-dark(#64748b,#94a3b8);--muted:light-dark(#666,#aaa)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}header{padding:16px 20px;border-bottom:1px solid var(--line)}h1{font-size:18px;margin:0 0 4px}p{margin:4px 0;color:var(--muted)}nav{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}a,button,select{color:inherit;border:1px solid var(--line);border-radius:6px;background:var(--bg);padding:6px 10px;font:inherit;white-space:nowrap}a{text-decoration:none}a[aria-current=page]{font-weight:600;outline:2px solid var(--fg);outline-offset:-2px}button{cursor:pointer}a:focus-visible,button:focus-visible,select:focus-visible{outline:2px solid var(--fg);outline-offset:2px}.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.controls label{display:flex;gap:6px;align-items:center}#frame-wrap{position:relative;max-width:100%;margin:16px auto}#frame-wrap::after{content:"";position:absolute;inset:0;border:2px solid var(--frame-border);pointer-events:none}iframe{display:block;width:100%;height:80vh;border:0}#opened{overflow-wrap:anywhere;padding:0 20px}html,body{overflow-x:clip}
</style></head><body><header><h1>風土記 MCP UI 開発プレビュー</h1><p>試験データを使用。各パターンのUIをiframe内で操作できます。</p>
<nav aria-label="UIパターン">${PATTERNS.map(([value, label]) => `<a data-pattern="${value}" href="/preview?ui=${value}">${label}</a>`).join('')}</nav>
<div class="controls"><label>テーマ<select id="preview-theme" aria-label="プレビューのテーマ"><option value="chatgpt-light">ChatGPT風 light</option><option value="chatgpt-dark">ChatGPT風 dark</option><option value="claude-light">Claude風 light</option><option value="claude-dark">Claude風 dark</option></select></label>
<label>幅<select id="preview-width" aria-label="iframeの幅"><option value="full">全幅</option><option value="320">320px</option><option value="375">375px</option><option value="414">414px</option><option value="768">768px</option></select></label>
<button id="preview-reset" type="button">最初から</button><button id="preview-release" type="button" hidden>待機中の応答を返す</button><button id="preview-result" type="button" hidden>別の結果へ切替</button></div><p>PDFは明細の頁番号から開けます。UIソースの保存時に再読み込みします。</p>
</header><div id="frame-wrap"><iframe title="風土記" sandbox="allow-scripts"></iframe></div><p id="opened" role="status"></p><script type="module" src="/host.js"></script></body></html>`
}
