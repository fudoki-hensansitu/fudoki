// fudoki.dev の入口の1枚。視覚の規範は repo root の DESIGN.md、ロゴと favicon は build:brand が書く logo.ts から inline にする（Worker は assets を持たない）
// 見出しの明朝は /fonts/mincho.woff2（この頁で使う字だけの subset）。文言を変えたら `bun run --cwd apps/web build:font` で作り直す
import { HOME } from './home-data'
import { PWA_HEAD, PWA_REGISTER } from './pwa'
import { BACKGROUND_DARK, BACKGROUND_LIGHT, THEME_COLOR_META } from './tokens'
import { LOGO_G, LOGO_WIDTH } from './logo'
import { withSiteNav } from './nav/render'

const MCP = 'https://api.fudoki.dev/mcp'
const DOCS = 'https://docs.fudoki.dev'
const GITHUB = 'https://github.com/fudoki-hensansitu/fudoki'
const CHATGPT_PLUGIN = 'https://chatgpt.com/plugins/plugin_asdk_app_6ad87dc03a608191a13bba05310ea5d9'
export const TURNSTILE_SCRIPT = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>'

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`
// 億・万の表記。万未満は切り捨てるので、正確な額は title に yen で添える
const oku = (n: number) => {
  if (n === 0) return '0円'
  const o = Math.floor(n / 1e8)
  const m = Math.floor((n % 1e8) / 1e4)
  return `${o ? `${o}億` : ''}${m ? `${m.toLocaleString('ja-JP')}万` : ''}円`
}
const icon = (id: string) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`

export const logo = (cls: string) => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_WIDTH} 40" role="img" aria-label="風土記"><title>風土記</title>${LOGO_G}</svg>`

const { nakano, ledgers, origin, library } = HOME
const libraryMax = Math.max(...library.rows.map((r) => r.amount))

/** 色・字・角の token。会話の画面（chat-shell.ts）も同じものを使う */
export const TOKENS_CSS = `
@font-face{font-family:"Fudoki Mincho";src:url("/fonts/mincho.woff2") format("woff2");font-weight:400;font-display:swap}
:root{
--background:${BACKGROUND_LIGHT};--foreground:#2b2723;--card:#f8f5ee;--card-foreground:#2b2723;
--secondary:#ece6da;--secondary-foreground:#2b2723;--muted:#ece6da;--muted-foreground:#6b655c;
--primary:#2f5d43;--primary-foreground:#f8f5ee;--accent:#e9efe9;--accent-foreground:#2f5d43;
--border:#ddd6c8;--ring:#2f5d43;
--paper:#e4d8bf;--paper-foreground:#2b2723;--night:#2b2723;--night-foreground:#f8f5ee;
--page:#ffffff;--page-foreground:#2b2723;
--shu:#c1553a;--ai:#33507a;--kincha:#e3a43c;--sakura:#ebcab9;
--font-display:"Fudoki Mincho","BIZ UDPMincho","Hiragino Mincho ProN","Yu Mincho",serif;
--font-sans:"Hiragino Sans","Noto Sans JP","Yu Gothic UI","Yu Gothic",Meiryo,system-ui,sans-serif;
--font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
--radius:8px;--radius-sm:4px;--radius-card:16px;--radius-sheet:24px;
--gut:max(24px,env(safe-area-inset-left),env(safe-area-inset-right),calc((100% - 1200px) / 2));
--hair:color-mix(in srgb,var(--foreground) 10%,transparent);
--shadow-sheet:0 20px 25px -5px color-mix(in srgb,var(--night) 12%,transparent),0 8px 10px -6px color-mix(in srgb,var(--night) 10%,transparent);
--shadow-pill:0 1px 2px color-mix(in srgb,var(--night) 4%,transparent),0 6px 20px color-mix(in srgb,var(--night) 6%,transparent);
--ease:cubic-bezier(.4,0,.2,1);--ease-sweep:cubic-bezier(.87,0,.13,1);
--grain:.32;--halftone:7px;--rays:28;
--noise:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-color-scheme:dark){:root{
--background:${BACKGROUND_DARK};--foreground:#ece6da;--card:#24211d;--card-foreground:#ece6da;
--secondary:#302c26;--secondary-foreground:#ece6da;--muted:#302c26;--muted-foreground:#a8a094;
--primary:#8fbfa2;--primary-foreground:#1b1916;--accent:#26332b;--accent-foreground:#8fbfa2;
--border:#3b362f;--ring:#8fbfa2;
--paper:#3a342b;--paper-foreground:#ece6da;--night:#0f0e0c;--night-foreground:#ece6da;
--shu:#d46a4f;--ai:#6f8fc0;--sakura:#b98f80;--grain:.5;
}}
`

const CSS = `${TOKENS_CSS}
*,::before,::after{box-sizing:border-box}
html{background:var(--background)}
body{margin:0;background:var(--background);color:var(--foreground);font:400 16px/1.8 var(--font-sans);letter-spacing:.03em;-webkit-font-smoothing:antialiased;line-break:strict;word-break:normal;overflow-wrap:break-word;overflow-x:clip}
h1,h2,h3,h4{margin:0;font-family:var(--font-display);font-weight:400;letter-spacing:.02em;color:var(--foreground);word-break:auto-phrase;text-wrap:balance}
p,figure{margin:0}
ul,ol{margin:0;padding:0;list-style:none}
:where(.site-main) a{color:inherit;text-decoration:none}
a:focus-visible,button:focus-visible,summary:focus-visible,video:focus-visible{outline:3px solid color-mix(in srgb,var(--ring) 50%,transparent);outline-offset:2px;border-radius:var(--radius-sm)}
code{font:13px/1.6 var(--font-mono);letter-spacing:0;overflow-wrap:anywhere}
.i{display:block;flex:none;width:16px;height:16px;fill:currentColor}
.num{font-variant-numeric:tabular-nums;letter-spacing:0;white-space:nowrap}
.wrap{padding-inline:var(--gut)}
.sec{padding-block:120px}
.eyebrow{font:400 14px/1.4 var(--font-display);color:var(--foreground)}
.muted{color:var(--muted-foreground)}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 24px;border:1px solid transparent;border-radius:999px;background:var(--primary);color:var(--primary-foreground);font:500 15px/1 var(--font-sans);letter-spacing:.03em;white-space:nowrap;transition:background-color 150ms var(--ease)}
.btn:hover{background:color-mix(in srgb,var(--primary) 84%,var(--foreground))}
.btn.ol{border-color:var(--foreground);background:transparent;color:var(--foreground)}
.btn.ol:hover{background:color-mix(in srgb,var(--foreground) 5%,transparent)}
.btn .i{width:14px;height:14px}
.logo{display:block;width:auto;color:var(--primary)}

dialog.setup{width:min(560px,calc(100% - 32px));padding:24px;border:.5px solid var(--border);border-radius:var(--radius-lg,16px);background:var(--background);color:var(--foreground)}
dialog.setup::backdrop{background:color-mix(in srgb,var(--foreground) 40%,transparent)}
dialog.setup h2{font-size:20px}
dialog.setup p{margin-top:8px;font-size:14px;color:var(--muted-foreground)}
dialog.setup pre{margin:16px 0;padding:14px;max-height:40svh;overflow:auto;border-radius:var(--radius-sm);background:var(--card);font:13px/1.7 var(--font-mono);letter-spacing:0;white-space:pre-wrap;overflow-wrap:anywhere}
button.setup-open{cursor:pointer}
dialog.setup .acts{display:flex;gap:8px;justify-content:flex-end}
dialog.setup .btn{cursor:pointer}

.art{position:absolute;overflow:hidden}
.art::after{content:"";position:absolute;inset:0;background:var(--noise);opacity:var(--grain);mix-blend-mode:multiply;pointer-events:none}
.art i{position:absolute;font:400 300px/.8 var(--font-display);font-style:normal;color:color-mix(in srgb,var(--night) 68%,var(--paper))}
.art s{position:absolute;inset:18% -30% auto 8%;height:66%;border:1.5px solid color-mix(in srgb,var(--shu) 80%,transparent);border-radius:50%;transform:rotate(-22deg)}
.paper{background:var(--paper)}
.oats{background:var(--secondary)}
.oats i{font-size:380px;color:color-mix(in srgb,var(--foreground) 8%,transparent)}
.burst{background:radial-gradient(circle at 50% 50%,transparent 40%,var(--night) 54%) 0 0/var(--halftone) var(--halftone),radial-gradient(46% 46% at 38% 62%,var(--kincha),color-mix(in srgb,var(--kincha) 40%,transparent) 40%,transparent 72%),repeating-conic-gradient(from 8deg at 38% 62%,var(--shu) 0 calc(180deg / var(--rays)),var(--ai) 0 calc(270deg / var(--rays)),var(--sakura) 0 calc(360deg / var(--rays)))}

.win{position:absolute;z-index:1;display:grid;align-content:start;gap:16px;padding:22px 26px;border:1px solid var(--hair);border-radius:var(--radius-card);background:var(--card);color:var(--card-foreground);box-shadow:var(--shadow-sheet)}
.win-h{font-size:22px;line-height:1.4}
.lines{display:grid;font-size:13px;line-height:1.5}
.lines .r{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--hair)}
.lines .r.d{padding-left:16px;color:var(--muted-foreground)}
.tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border:1px solid var(--hair);border-radius:999px;font-size:11px;color:var(--muted-foreground);white-space:nowrap;letter-spacing:0}

.hero{display:grid;justify-items:center;text-align:center;gap:28px;padding-block:88px 0}
.hero h1{font-size:clamp(2.5rem,1.4rem + 4.4vw,5.5rem);line-height:1.18;max-width:11em}
.hero .sub{max-width:34em;font-size:17px;line-height:1.9}
.acts{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.ask{width:min(100%,640px);text-align:left}
body.ask-docked{padding-bottom:144px}
.ask-box{min-height:120px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius-card);background:var(--card)}
.ledger-stage{position:relative;margin-top:64px;height:620px;overflow:hidden;border-radius:var(--radius)}
.ledger-stage .art{inset:0}
.ledger{left:6%;right:6%;top:56px;bottom:-40px;padding:26px 30px}
.tbl{width:100%;border-collapse:collapse;font-size:13px;line-height:1.5}
.tbl caption{text-align:left;font:400 22px/1.4 var(--font-display);padding-bottom:12px}
.ttl{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .4em;font:400 22px/1.4 var(--font-display)}
.roll{display:inline-block;height:1.4em;overflow:hidden;transition:width .7s var(--ease-sweep)}
.roll-in{display:grid;justify-items:start;width:max-content;transform:translateY(calc(var(--r,0) * -1.4em));transition:transform .7s var(--ease-sweep)}
.roll-in span{height:1.4em}
.tbls{display:grid}
.tbls caption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.tbls .tbl{grid-area:1/1;align-self:start;background:var(--card);transition:opacity .35s var(--ease)}
.tbls .tbl[data-pos=cur]{z-index:1}
.tbls .tbl:not([data-pos=cur]){opacity:0;visibility:hidden;transition:opacity 0s .35s,visibility 0s .35s}
.tbl th{padding:6px 8px;text-align:left;font-weight:500;color:var(--muted-foreground);font-size:12px;border-bottom:1px solid var(--hair)}
.tbl td{padding:8px;border-bottom:1px solid var(--hair);vertical-align:baseline}
.tbl .n{text-align:right;font-variant-numeric:tabular-nums;letter-spacing:0;white-space:nowrap}
.tbl .k td:first-child{font-weight:600}
.tbl .ko td:first-child{padding-left:26px}
.tbl .mo td:first-child{padding-left:44px}
.tbl .su td{color:var(--muted-foreground)}
.tbl .su td:first-child{padding-left:62px}
.tbl .su .lv{width:2.5em}
.tbl .lv{display:inline-block;width:1.5em;color:var(--muted-foreground);font-weight:400}

.steps{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:64px}
.rail{--at:0;position:sticky;top:0;align-self:start;display:grid;align-content:center;gap:28px;height:100svh;padding-top:72px;max-width:300px}
.rail-n{display:flex;align-items:flex-end;gap:14px}
.rail-n .win-n{height:1em;overflow:hidden;font:400 132px/1 var(--font-display);color:var(--shu)}
.rail-n .win-n span{display:block;transform:translateY(calc(var(--at) * -100%));transition:transform .6s var(--ease-sweep)}
.rail-n small{padding-bottom:12px;font:400 15px/1 var(--font-display);color:var(--muted-foreground)}
.gauge{display:block;height:2px;background:var(--hair)}
.gauge i{display:block;height:100%;width:calc((var(--at) + 1) * 100% / 3);background:var(--foreground);transition:width .6s var(--ease-sweep)}
.rail ol{display:grid}
.rail a{display:grid;grid-template-columns:2em minmax(0,1fr);gap:10px;padding:14px 0;border-bottom:1px solid var(--hair);color:var(--muted-foreground);transition:color .4s var(--ease)}
.rail a b{font:400 18px/1.4 var(--font-display)}
.rail a strong{display:block;font:400 18px/1.4 var(--font-display)}
.rail a small{display:block;margin-top:2px;font-size:12px;line-height:1.6}
.rail a:hover,.rail a[aria-current]{color:var(--foreground)}
.rail a[aria-current] b{color:var(--shu)}
.step{display:grid;align-content:center;gap:12px;min-height:100svh;padding-block:88px 32px;scroll-snap-align:start}
.step .k{font:400 14px/1 var(--font-display);color:var(--muted-foreground)}
.step h3{font-size:26px;line-height:1.45}
.step p{max-width:36em;font-size:15px;line-height:1.9}
.stage{position:relative;overflow:hidden;height:460px;margin-top:12px;border-radius:var(--radius)}
.stage .art{inset:0}
.stage .win{left:7%;top:28px;right:5%;bottom:-20px;box-shadow:none}
.bars{display:grid;gap:9px;font-size:13px}
.bars .b{display:grid;grid-template-columns:5.5em minmax(0,1fr) 7.5em;align-items:center;gap:10px}
.bars .b i{display:block;height:10px;border-radius:999px;background:var(--foreground)}
.bars .b .num{text-align:right;font-size:12px;color:var(--muted-foreground)}
.stage.pdf{height:auto;padding:28px 4% 28px 6%}
.sheet{position:relative;z-index:1;display:grid;align-content:start;gap:14px;padding:18px 20px;border-radius:var(--radius-sm);background:var(--page);color:var(--page-foreground);box-shadow:var(--shadow-sheet)}
.sheet figcaption{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:color-mix(in srgb,var(--page-foreground) 60%,var(--page))}
.crop{position:relative}
.crop img{display:block;width:100%;height:auto}
.crop .mark{position:absolute;border:2px solid var(--shu);border-radius:3px}
.sheet p{font-size:13px;line-height:1.7}
.sheet b{font-weight:600}
.sheet small{display:block;font-size:12px;color:color-mix(in srgb,var(--page-foreground) 60%,var(--page))}

.mcp{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:64px;align-items:center;padding-block:96px;background:var(--paper);color:var(--paper-foreground)}
.mcp h2{margin-top:16px;font-size:clamp(2.25rem,1.5rem + 3vw,4.25rem);line-height:1.25;color:var(--paper-foreground)}
.mcp .eyebrow{color:var(--paper-foreground)}
.mcp .lead{margin-top:16px;font-size:15px;line-height:1.8}
.connect{margin-top:24px;border:1px solid color-mix(in srgb,var(--paper-foreground) 20%,transparent);border-radius:var(--radius-card,16px);background:var(--background);color:var(--foreground);overflow:hidden}
.ctabs{display:flex;gap:2px;margin:6px;padding:3px;border-radius:12px;background:var(--card);overflow-x:auto;scrollbar-width:none}
.ctabs button{display:inline-flex;align-items:center;gap:6px;flex:none;height:34px;padding:0 10px;border:1px solid transparent;border-radius:9px;background:transparent;color:color-mix(in srgb,var(--foreground) 60%,transparent);font:500 14px/1 var(--font-sans);letter-spacing:.02em;white-space:nowrap;cursor:pointer}
.ctabs button:hover{color:var(--foreground)}
.ctabs button[aria-selected="true"]{background:var(--background);color:var(--foreground);box-shadow:0 1px 3px rgb(0 0 0/.1),0 1px 2px -1px rgb(0 0 0/.1)}
.ctabs .i{width:16px;height:16px}
.cpanel ol{display:grid;gap:18px;padding:16px 20px 22px}
.cpanel li{display:grid;grid-template-columns:28px 1fr;gap:12px;font-size:15px;line-height:1.8}
.cpanel li>div{min-width:0}
.cpanel li>b{display:grid;place-items:center;width:28px;height:28px;margin-top:1px;border-radius:999px;background:var(--card);font:500 13px/1 var(--font-sans)}
.cpanel .btn{margin-top:12px;display:flex;width:fit-content}
.ccode{display:flex;align-items:flex-start;gap:8px;margin-top:10px;padding:8px 8px 8px 14px;border-radius:var(--radius-sm,8px);background:var(--card)}
.ccode pre{flex:1;min-width:0;padding:4px 0;overflow-x:auto;font:13px/1.7 var(--font-mono);letter-spacing:0;white-space:pre}
.ccopy{flex:none;height:28px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--foreground);font:500 12px/1 var(--font-sans);cursor:pointer}
.demo{display:grid;gap:14px}
.demo video{display:block;width:100%;height:auto;aspect-ratio:1280/840;border-radius:var(--radius-card);background:#f4f1e6;/* brand/config.json の paper。サムネ（OGP 画像）の地と揃える */box-shadow:var(--shadow-sheet)}
.demo video{cursor:pointer}
.demo figcaption{display:flex;justify-content:flex-end;font-size:13px;line-height:1.6}
.demo a{display:inline-flex;align-items:center;gap:6px;color:var(--paper-foreground);white-space:nowrap;text-decoration:underline;text-underline-offset:3px}
.demo a .i{width:14px;height:14px}

.faq{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:64px}
.faq h2{font-size:clamp(1.75rem,1.3rem + 1.6vw,2.75rem);line-height:1.4}
details{border-top:1px solid var(--hair)}
details:last-child{border-bottom:1px solid var(--hair)}
summary{display:flex;justify-content:space-between;gap:16px;padding:20px 0;font:400 19px/1.5 var(--font-display);list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font:300 24px/1 var(--font-sans);color:var(--muted-foreground);transition:transform 150ms var(--ease)}
details[open] summary::after{transform:rotate(45deg)}
details p{max-width:56ch;padding-bottom:22px;font-size:15px;line-height:1.9;color:var(--muted-foreground)}
details p a{text-decoration:underline;text-underline-offset:3px}

footer{margin-top:96px;padding-top:80px;background:var(--secondary)}
.cols{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px}
.cols h2{margin:0 0 18px;font-size:18px;line-height:1}
.cols ul{display:grid;gap:10px;font-size:13px}
.cols a{white-space:nowrap}
.cols a:hover{color:var(--muted-foreground)}
.legal{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;margin-top:72px;padding-block:24px 40px;border-top:1px solid var(--hair);font-size:12px;color:var(--muted-foreground)}
.cols .logo{height:30px;margin-bottom:18px}
.cols p{font-size:13px;line-height:1.8;color:var(--muted-foreground)}

.sweep{background:linear-gradient(90deg,var(--foreground) 0 33.33%,var(--kincha) 40%,var(--shu) 46%,var(--sakura) 52%,var(--ai) 58%,var(--foreground) 66.67%) 0 0/300% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}

@media (max-width:960px){
.steps,.mcp,.faq{grid-template-columns:minmax(0,1fr)}
.rail{display:none}
.step{min-height:0;padding-block:0 96px}
.step:last-child{padding-bottom:0}
.cols{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:560px){
.sec{padding-block:80px}
.hero{padding-top:56px}
.ledger-stage{height:540px;margin-inline:calc(-1 * var(--gut));border-radius:0}
.ledger{left:4%;right:4%;padding:20px 16px}
.tbl{font-size:12px}
.tbl th:nth-child(2),.tbl td:nth-child(2),.tbl th:nth-child(4),.tbl td:nth-child(4){display:none}
.tbl caption,.ttl{font-size:18px}
.hero .sub{text-align:left}
.tbl .ko td:first-child{padding-left:12px}
.tbl .mo td:first-child{padding-left:20px}
.tbl .su td:first-child{padding-left:28px}
.stage{height:440px}
.bars .b{grid-template-columns:4.5em minmax(0,1fr) 6.5em}
.mcp{padding-block:72px}
}
@media (max-width:400px){
.cols{grid-template-columns:minmax(0,1fr)}
}
@media (min-width:961px){:root{--gut:max(56px,env(safe-area-inset-left),env(safe-area-inset-right),calc((100% - 1200px) / 2))}html[data-snap]{scroll-snap-type:y mandatory}#mcp{scroll-snap-align:start}.ledger-stage{scroll-snap-align:end}}
@media (prefers-reduced-motion:no-preference){
html{scroll-behavior:smooth}
.sweep.in{animation:sweep 1.4s var(--ease-sweep) both}
@keyframes sweep{from{background-position:100% 0}to{background-position:0 0}}
}
@media (prefers-reduced-motion:reduce){.rail *{transition:none}}
`

const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="arrow-right" viewBox="0 0 256 256"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></symbol>
<symbol id="i-openai" viewBox="0 0 256 256"><path d="M224.32,114.24a56,56,0,0,0-60.07-76.57A56,56,0,0,0,67.93,51.44a56,56,0,0,0-36.25,90.32A56,56,0,0,0,69,217,56.39,56.39,0,0,0,83.59,219a55.75,55.75,0,0,0,8.17-.61,56,56,0,0,0,96.31-13.78,56,56,0,0,0,36.25-90.32ZM182.85,54.43a40,40,0,0,1,28.56,48c-.95-.63-1.91-1.24-2.91-1.81L164,74.88a8,8,0,0,0-8,0l-44,25.41V81.81l40.5-23.38A39.76,39.76,0,0,1,182.85,54.43ZM144,137.24l-16,9.24-16-9.24V118.76l16-9.24,16,9.24ZM80,72a40,40,0,0,1,67.53-29c-1,.51-2,1-3,1.62L100,70.27a8,8,0,0,0-4,6.92V128l-16-9.24ZM40.86,86.93A39.75,39.75,0,0,1,64.12,68.57C64.05,69.71,64,70.85,64,72v51.38a8,8,0,0,0,4,6.93l44,25.4L96,165,55.5,141.57A40,40,0,0,1,40.86,86.93ZM73.15,201.57a40,40,0,0,1-28.56-48c.95.63,1.91,1.24,2.91,1.81L92,181.12a8,8,0,0,0,8,0l44-25.41v18.48l-40.5,23.38A39.76,39.76,0,0,1,73.15,201.57ZM176,184a40,40,0,0,1-67.52,29.05c1-.51,2-1.05,3-1.63L156,185.73a8,8,0,0,0,4-6.92V128l16,9.24Zm39.14-14.93a39.75,39.75,0,0,1-23.26,18.36c.07-1.14.12-2.28.12-3.43V132.62a8,8,0,0,0-4-6.93l-44-25.4,16-9.24,40.5,23.38A40,40,0,0,1,215.14,169.07Z"></path></symbol>
<symbol id="i-asterisk" viewBox="0 0 256 256"><path d="M214.86,180.12a8,8,0,0,1-11,2.74L136,142.13V216a8,8,0,0,1-16,0V142.13L52.12,182.86a8,8,0,1,1-8.23-13.72L112.45,128,43.89,86.86a8,8,0,1,1,8.23-13.72L120,113.87V40a8,8,0,0,1,16,0v73.87l67.88-40.73a8,8,0,1,1,8.23,13.72L143.55,128l68.56,41.14A8,8,0,0,1,214.86,180.12Z"></path></symbol>
<symbol id="i-terminal" viewBox="0 0 256 256"><path d="M128,128a8,8,0,0,1-3,6.25l-40,32a8,8,0,1,1-10-12.5L107.19,128,75,102.25a8,8,0,1,1,10-12.5l40,32A8,8,0,0,1,128,128Zm48,24H136a8,8,0,0,0,0,16h40a8,8,0,0,0,0-16Zm56-96V200a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V56A16,16,0,0,1,40,40H216A16,16,0,0,1,232,56ZM216,200V56H40V200H216Z"></path></symbol>
<symbol id="i-cursor" viewBox="0 0 256 256"><path d="M168,132.69,214.08,115l.33-.13A16,16,0,0,0,213,85.07L52.92,32.8A15.95,15.95,0,0,0,32.8,52.92L85.07,213a15.82,15.82,0,0,0,14.41,11l.78,0a15.84,15.84,0,0,0,14.61-9.59l.13-.33L132.69,168,184,219.31a16,16,0,0,0,22.63,0l12.68-12.68a16,16,0,0,0,0-22.63ZM195.31,208,144,156.69a16,16,0,0,0-26,4.93c0,.11-.09.22-.13.32l-17.65,46L48,48l159.85,52.2-45.95,17.64-.32.13a16,16,0,0,0-4.93,26h0L208,195.31Z"></path></symbol>
<symbol id="i-plug" viewBox="0 0 256 256"><path d="M237.66,66.34a8,8,0,0,0-11.32,0L192,100.69,155.31,64l34.35-34.34a8,8,0,1,0-11.32-11.32L144,52.69,117.66,26.34a8,8,0,0,0-11.32,11.32L112.69,44l-53,53a40,40,0,0,0,0,56.57l15.71,15.71L26.34,218.34a8,8,0,0,0,11.32,11.32l49.09-49.09,15.71,15.71a40,40,0,0,0,56.57,0l53-53,6.34,6.35a8,8,0,0,0,11.32-11.32L203.31,112l34.35-34.34A8,8,0,0,0,237.66,66.34ZM147.72,185a24,24,0,0,1-33.95,0L71,142.23a24,24,0,0,1,0-33.95l53-53L200.69,132Z"></path></symbol>
<symbol id="arrow-square-out" viewBox="0 0 256 256"><path d="M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z"/></symbol>
</svg>`

const ledgerRows = (l: (typeof ledgers)[number]) =>
  [
    `<tr class="k"><td><span class="lv">大</span>${l.kan.name}</td><td></td><td class="n">${yen(l.kan.amount)}</td><td class="n">${l.kan.page}頁</td></tr>`,
    `<tr class="ko"><td><span class="lv">中</span>${l.kou.name}</td><td></td><td class="n">${yen(l.kou.amount)}</td><td class="n">${l.kou.page}頁</td></tr>`,
    ...l.moku.flatMap((m) => [
      `<tr class="mo"><td><span class="lv">小</span>${m.name}</td><td><span class="tag">${m.cofog}</span></td><td class="n">${yen(m.amount)}</td><td class="n">${m.page}頁</td></tr>`,
      ...m.detail.map((d) => `<tr class="su"><td><span class="lv">${d.kind}</span>${d.name}</td><td></td><td class="n">${yen(d.amount)}</td><td class="n">${d.page}頁</td></tr>`),
    ]),
  ].join('')

const ledgerTables = ledgers
  .map(
    (l, i) =>
      `<table class="tbl"${i ? '' : ' data-pos="cur"'}><caption>${l.jurisdiction} · ${nakano.period} · 一般会計</caption>
<thead><tr><th scope="col">項目</th><th scope="col">共通分類</th><th scope="col" class="n">使った額</th><th scope="col" class="n">出典</th></tr></thead>
<tbody>${ledgerRows(l)}</tbody></table>`,
  )
  .join('')

// 出典の切り抜きの上に、印字の位置を % で重ねる（3pt の余白を付ける）
const [cx0, cy0, cx1, cy1] = origin.crop
const [mx0, my0, mx1, my1] = origin.mark
const pct = (v: number, w: number) => `${((v / w) * 100).toFixed(2)}%`
const markStyle = `left:${pct(mx0 - 3 - cx0, cx1 - cx0)};top:${pct(my0 - 3 - cy0, cy1 - cy0)};width:${pct(mx1 - mx0 + 6, cx1 - cx0)};height:${pct(my1 - my0 + 6, cy1 - cy0)}`

const SETUP_PROMPT = [
  `風土記（町の家計簿）の MCP サーバーを、私が使っているこの AI クライアントに追加したいです。`,
  `- 種類: リモート MCP サーバー（Streamable HTTP）`,
  `- URL: ${MCP}`,
  `- 認証: 不要`,
  `- ChatGPT・Codex（ChatGPT デスクトップアプリ）なら、plugin ディレクトリの風土記（https://chatgpt.com/plugins/plugin_asdk_app_6ad87dc03a608191a13bba05310ea5d9）をインストールするだけで使えます`,
  ``,
  `私が使っているクライアントを確認したうえで、その設定画面（または設定ファイル）での追加手順を、一つずつ案内してください。`,
  `自分で設定を書き換えられる環境なら、書き換えてかまいません。`,
  `追加できたら、「北区に住んでいます。何の予算が見れますか？」と聞いて、接続を確かめてください。`,
].join('\n')

const ASK = '「北区に住んでいます。何の予算が見れますか？」と聞きます。'
const code = (t: string) => `<div class="ccode"><pre><code>${t}</code></pre><button type="button" class="ccopy" data-copy-code>コピー</button></div>`
// 「AI から使う」のタブ。手順は docs の各クライアントの頁と揃える
const CONNECT = [
  { id: 'chatgpt', label: 'ChatGPT', icon: 'i-openai', steps: [
    `風土記の plugin を開いて「＋」で追加します。<a class="btn" href="${CHATGPT_PLUGIN}" target="_blank" rel="noopener">風土記の plugin を開く${icon('arrow-square-out')}</a>`,
    `新しい会話で${ASK}ChatGPT でも Codex でも使えます。`,
  ] },
  { id: 'claude', label: 'Claude', icon: 'i-asterisk', steps: [
    `設定の「コネクタ」で、カスタムコネクタを追加します。名前は「風土記」、URL は次のとおりです。認証はいりません。${code(MCP)}`,
    `会話で風土記を有効にして、${ASK}`,
  ] },
  { id: 'claude-code', label: 'Claude Code', icon: 'i-terminal', steps: [
    `ターミナルで次を実行します。${code('claude plugin marketplace add fudoki-hensansitu/fudoki\nclaude plugin install fudoki@fudoki-plugins')}`,
    `新しい会話で${ASK}`,
  ] },
  { id: 'cursor', label: 'Cursor', icon: 'i-cursor', steps: [
    `設定の Plugins で「From GitHub Repository」を選び、次の URL を入れて、出てきた風土記を Install します。${code(GITHUB)}`,
    `新しい会話で${ASK}`,
  ] },
  { id: 'other', label: 'そのほか', icon: 'i-plug', steps: [
    `AI の設定で、つなぎ先として次の URL を追加します。認証はいりません。${code(MCP)}`,
    `やり方が分からなければ、AI に聞くのが早道です。<button class="btn setup-open" type="button" data-open="setup">AI に貼り付ける文章を見る</button>`,
  ] },
]

const BODY = `${ICONS}
<dialog class="setup" id="setup" aria-labelledby="setup-h"><h2 id="setup-h">AI に貼り付けて接続する</h2>
<p>下の文章をコピーして、お使いの AI（Claude・ChatGPT など）に貼り付けると、風土記をつなぐ手順を案内してくれます。</p>
<pre id="setup-text">${SETUP_PROMPT}</pre>
<div class="acts"><button class="btn ol" type="button" data-close>閉じる</button><button class="btn" type="button" data-copy>コピーする</button></div></dialog>
<main>
<header class="hero wrap">
<p class="eyebrow">風土記 — 町の家計簿</p>
<h1 class="sweep">あなたの街は、何にいくら使ったか</h1>
<p class="sub">自治体の予算書と決算書を、事業ごとの表にしました。AI に聞けば、他の街や他の年と同じ物差しで比べ、出典の頁まで返します。</p>
<div id="chat-start" class="ask" data-turnstile-sitekey="__TURNSTILE_SITE_KEY__"><div class="ask-box"><p class="muted">風土記の AI に聞く</p><noscript>AI に聞くには JavaScript を有効にしてください。</noscript></div></div>
<div class="acts"><a class="btn ol" href="#mcp">自分の AI に接続する${icon('arrow-right')}</a><a class="btn ol" href="${DOCS}">ドキュメント</a></div>
</header>
<div class="wrap"><div class="ledger-stage">
<div class="art oats" aria-hidden="true"><i style="left:-40px;top:-40px">帳</i></div>
<div class="win ledger">
<p class="ttl" aria-hidden="true"><span class="roll"><span class="roll-in">${[...ledgers, ledgers[0]!].map((l) => `<span>${l.jurisdiction}</span>`).join('')}</span></span><span>· ${nakano.period} · 一般会計</span></p>
<div class="tbls">${ledgerTables}</div>
</div>
</div></div>

<section class="sec wrap" id="how" aria-label="3つのステップ">
<div class="steps">
<nav class="rail" aria-label="3つのステップ">
<div class="rail-n" aria-hidden="true"><span class="win-n"><span>一</span><span>二</span><span>三</span></span><small>／ 三</small></div>
<span class="gauge" aria-hidden="true"><i></i></span>
<ol><li><a href="#see" aria-current="step"><b>一</b><span><strong>見る</strong><small>大きな分類から、細かい事業まで</small></span></a></li><li><a href="#compare"><b>二</b><span><strong>比べる</strong><small>共通の分類で、街をまたいで並べる</small></span></a></li><li><a href="#check"><b>三</b><span><strong>確かめる</strong><small>出典の頁と、印字の位置で</small></span></a></li></ol>
</nav>
<div>
<article class="step" id="see"><span class="k">ステップ一　見る</span><h3>一つの街の支出を、事業の単位で</h3>
<p>大きな分類から、その内訳、さらに細かい事業まで、出典の並びのまま引けます。予算案・当初予算・途中で組み替えた予算・決算（実際に使った額）は、別々の金額として持ちます。</p>
<div class="stage"><div class="art paper" aria-hidden="true"><i style="right:-20px;top:-30px">見</i><s></s></div>
<div class="win"><h4 class="win-h">${nakano.jurisdiction}の大きな分類 · ${nakano.period}</h4>
<div class="lines">${nakano.kanList.map((k) => `<div class="r"><span>${k.name}</span><span class="num" title="${yen(k.amount)}">${oku(k.amount)}</span></div>`).join('')}</div></div></div>
</article>
<article class="step" id="compare"><span class="k">ステップ二　比べる</span><h3>別の街と、同じ物差しで</h3>
<p>大きな分類の名前は街ごとに違います。中野区には「民生費」という分類がありません。だから細かい分類ごとに、目的別の共通分類（国際基準 COFOG）を割り当て、街をまたいで並べられるようにしています。</p>
<div class="stage"><div class="art burst" aria-hidden="true"></div>
<div class="win"><h4 class="win-h">「${library.name}」 · 共通分類 ${library.cofog}</h4>
<div class="bars">${library.rows.map((r) => `<div class="b"><span>${r.jurisdiction}</span><i style="width:${((r.amount / libraryMax) * 100).toFixed(1)}%" aria-hidden="true"></i><span class="num" title="${yen(r.amount)}">${oku(r.amount)}</span></div>`).join('')}</div>
<p class="muted" style="font-size:12px">${library.period}。人口あたりの額ではありません。</p></div></div>
</article>
<article class="step" id="check"><span class="k">ステップ三　確かめる</span><h3>怪しい数字は、出典の頁で</h3>
<p>明細ごとに出典の頁と印字の位置を持ち、分類が確かか・仮か・できないかも返します。数字に引っかかったら、その頁を開けば確かめられます。</p>
<div class="stage pdf"><div class="art oats" aria-hidden="true"><i style="left:-30px;top:-40px">確</i></div>
<figure class="sheet"><figcaption><span>${origin.jurisdiction} · ${origin.document}</span><span class="num">PDF ${origin.page}頁</span></figcaption>
<div class="crop"><img src="/home/origin.webp" width="2136" height="879" loading="lazy" alt="${origin.jurisdiction}の決算書 ${origin.page}頁の切り抜き。「${origin.name}」の使った額 ${yen(origin.amount)}"><i class="mark" style="${markStyle}" aria-hidden="true"></i></div>
<p>「${origin.name}」の使った額 <b class="num">${yen(origin.amount)}</b><small>囲みは、API が返す印字の位置</small></p></figure></div>
</article>
</div></div>
</section>

<section class="mcp wrap" id="mcp" aria-labelledby="mcp-h">
<div><p class="eyebrow">AI から使う</p><h2 id="mcp-h">いつもの AI からも使えます</h2>
<p class="lead">ChatGPT や Claude に風土記をつなぐと、会話の中で街の支出を調べられます。登録はいりません。</p>
<div class="connect">
<div class="ctabs" role="tablist" aria-label="使っている AI">${CONNECT.map((c, i) => `<button type="button" role="tab" id="ct-${c.id}" aria-controls="cp-${c.id}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${icon(c.icon)}${c.label}</button>`).join('')}</div>
${CONNECT.map((c, i) => `<div class="cpanel" role="tabpanel" id="cp-${c.id}" aria-labelledby="ct-${c.id}"${i ? ' hidden' : ''}><ol>${c.steps.map((st, j) => `<li><b>${j + 1}</b><div>${st}</div></li>`).join('')}</ol></div>`).join('')}
</div></div>
<figure class="demo">
<video src="/home/demo.mp4" poster="/home/demo-poster.webp" width="1280" height="840" muted loop playsinline preload="none" tabindex="0" aria-label="ChatGPT につないだ風土記に、北区の決算を聞いた操作の録画。Enter で再生・停止"></video>
<figcaption><a href="${DOCS}">つなぎ方をくわしく見る${icon('arrow-right')}</a></figcaption>
</figure>
</section>

<section class="sec wrap faq" id="faq" aria-labelledby="faq-h"><h2 id="faq-h">よくある質問</h2><div>
<details open><summary>数字はどこから来ていますか</summary><p>自治体が公開した予算書・決算書（PDF または CSV）です。表に読み込んだあと、出典の中で重ねて印字された合計どうしが一致するかを確かめています。明細ごとに、出典の頁と印字された位置を持っています。</p></details>
<details><summary>予備費が 0 円なのは、使わなかったからですか</summary><p>いいえ。決算の予備費は、他の費目へ補ったあとの使った額なので 0 円になります。どこへ補ったかは出典の備考にあり、風土記では注記の金額として、費目の金額とは別に持ちます。</p></details>
<details><summary>共通分類（COFOG）は正しいのですか</summary><p>分類は出典にない、風土記の判断です。確かなもの・仮のもの・分類できないものを区別して返し、分類できない明細も合計から落としません。</p></details>
<details><summary>どの自治体・年度が入っていますか</summary><p>収録する自治体と年度は、順次広げています。いま入っている範囲は、AI に聞くか<a href="${DOCS}">ドキュメント</a>で確かめられます。収録していないことは、支出がゼロであることを意味しません。</p></details>
<details><summary>使うのにお金や登録は要りますか</summary><p>要りません。このサイトのチャットに質問を入力すれば、登録なしでそのまま調べられます。ChatGPT や Claude など、いつも使っている AI につないで使うこともできます。詳しくは<a href="${DOCS}/terms">利用規約</a>をご覧ください。</p></details>
</div></section>
</main>

<footer class="wrap">
<div class="cols">
<div><a href="/" aria-label="風土記 ホーム">${logo('logo')}</a><p>町の家計簿。自治体の支出を、事業ごとに。</p></div>
<div><h2>使う</h2><ul><li><a href="/jurisdictions">自治体を探す</a></li><li><a href="#mcp">AI から使う</a></li><li><a href="${DOCS}">ドキュメント</a></li></ul></div>
<div><h2>作り</h2><ul><li><a href="${GITHUB}">GitHub</a></li><li><a href="${DOCS}/support">サポート</a></li><li><a href="mailto:support@fudoki.dev">お問い合わせ</a></li></ul></div>
<div><h2>決まりごと</h2><ul><li><a href="${DOCS}/privacy">プライバシーポリシー</a></li><li><a href="${DOCS}/terms">利用規約</a></li></ul></div>
</div>
<div class="legal"><span>713年、諸国に同じ様式で報告させた地誌にならって</span><span>© 2026 風土記</span></div>
</footer>`

// 見出しの sweep、3つのステップの現在地。どれも無くても読める
const SCRIPT = `const sp=document.querySelector('.steps'),h=document.documentElement;const s=()=>{const b=sp.getBoundingClientRect();h.toggleAttribute('data-snap',b.top<=1&&b.bottom>=innerHeight-1)};addEventListener('scroll',s,{passive:true});s();
if('IntersectionObserver'in window){const o=new IntersectionObserver(l=>l.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');o.unobserve(e.target)}}),{threshold:.6});document.querySelectorAll('.sweep').forEach(e=>o.observe(e));
const r=document.querySelector('.rail'),t=[...document.querySelectorAll('.rail a')],st=[...document.querySelectorAll('.step')];const p=new IntersectionObserver(l=>l.forEach(e=>{if(e.isIntersecting){const i=st.indexOf(e.target);r.style.setProperty('--at',i);t.forEach((a,j)=>j===i?a.setAttribute('aria-current','step'):a.removeAttribute('aria-current'))}}),{rootMargin:'-45% 0px -45% 0px'});st.forEach(e=>p.observe(e))}
const dg=document.getElementById('setup');if(dg&&dg.showModal){document.querySelector('[data-open]').addEventListener('click',()=>dg.showModal());dg.querySelector('[data-close]').addEventListener('click',()=>dg.close());dg.addEventListener('click',e=>{if(e.target===dg)dg.close()});const cb=dg.querySelector('[data-copy]');cb.addEventListener('click',()=>{const done=t=>{cb.textContent=t;setTimeout(()=>{cb.textContent='コピーする'},2000)};Promise.resolve().then(()=>navigator.clipboard.writeText(document.getElementById('setup-text').textContent)).then(()=>done('コピーしました'),()=>done('コピーできませんでした'))})}
const rm=matchMedia('(prefers-reduced-motion: reduce)').matches,lg=document.querySelector('.ledger');if(lg&&!rm&&'IntersectionObserver'in window){const ts=[...lg.querySelectorAll('.tbl')],ro=lg.querySelector('.roll-in'),ns=[...ro.children],n=ts.length;let i=0,id=0,vis=false;const fit=()=>{ro.parentElement.style.width=ns[i].offsetWidth+'px'};fit();document.fonts&&document.fonts.ready.then(fit);
ro.addEventListener('transitionend',()=>{if(i===n){ro.style.transition='none';i=0;ro.style.setProperty('--r',0);ro.offsetWidth;ro.style.transition=''}});
const step=()=>{i++;ro.style.setProperty('--r',i);fit();ts.forEach((t,k)=>k===i%n?t.dataset.pos='cur':delete t.dataset.pos)};
const run=()=>{clearInterval(id);if(vis)id=setInterval(step,2000)};
new IntersectionObserver(l=>{vis=l[0].isIntersecting;run()}).observe(lg)}
const tl=document.querySelector('.ctabs');if(tl){const tb=[...tl.querySelectorAll('[role=tab]')];const sel=(b,f)=>{tb.forEach(x=>{const on=x===b;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById(x.getAttribute('aria-controls')).hidden=!on});if(f)b.focus()};tb.forEach((b,i)=>{b.addEventListener('click',()=>sel(b));b.addEventListener('keydown',e=>{const n={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:tb.length-1}[e.key];if(n===undefined)return;e.preventDefault();sel(tb[(n+tb.length)%tb.length],true)})})}
document.querySelectorAll('[data-copy-code]').forEach(b=>b.addEventListener('click',()=>{const t=b.previousElementSibling.textContent;Promise.resolve().then(()=>navigator.clipboard.writeText(t)).then(()=>{b.textContent='コピーしました';setTimeout(()=>{b.textContent='コピー'},2000)},()=>{})}))
const v=document.querySelector('.demo video');if(v){let user=rm;const tg=()=>{if(v.paused){user=false;v.play()}else{user=true;v.pause()}};v.addEventListener('click',tg);v.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tg()}});
if('IntersectionObserver'in window)new IntersectionObserver(l=>{if(l[0].isIntersecting){if(!user)v.play().catch(()=>{})}else v.pause()},{threshold:.4}).observe(v)}`

const DESCRIPTION = '日本の自治体の支出の予算と決算を事業ごとに集め、AI から問い合わせられるデータとして配る。'

/** 入口の1枚。open はサイドバーを開いて書くか（navOpen で cookie から決める） */
export const landingHtml = (open: boolean) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>風土記（fudoki）— 町の家計簿</title>
<meta name="description" content="${DESCRIPTION}">
${THEME_COLOR_META}
<link rel="canonical" href="https://fudoki.dev/">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${PWA_HEAD}
<link rel="preload" href="/fonts/mincho.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:site_name" content="風土記（fudoki）">
<meta property="og:title" content="風土記（fudoki）— 町の家計簿">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="https://fudoki.dev/">
<meta property="og:image" content="https://fudoki.dev/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"風土記（fudoki）","url":"https://fudoki.dev/","logo":"https://fudoki.dev/icon.png","sameAs":["https://github.com/fudoki-hensansitu","https://docs.fudoki.dev/"]}</script>
<style>${CSS}</style>
<link rel="stylesheet" href="/_app/start.css">
<script type="module" src="/_app/start.js"></script>
${TURNSTILE_SCRIPT}
</head>
<body>
${withSiteNav(BODY, { open })}
<script>${SCRIPT}</script>
${PWA_REGISTER}
</body>
</html>
`

/** サイドバーを開いた既定の入口（字の subset を作る build:font が読む） */
export const LANDING_HTML = landingHtml(true)
