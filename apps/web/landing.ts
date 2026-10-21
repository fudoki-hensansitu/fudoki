// fudoki.dev の入口の1枚。視覚の規範は repo root の DESIGN.md、ロゴは public/logo.svg・favicon は public/favicon.svg の写し（Worker は assets を持たないので inline にする）
// 見出しの明朝は /fonts/mincho.woff2（この頁で使う字だけの subset）。文言を変えたら `bun run --cwd apps/web build:font` で作り直す
import { HOME } from './home-data'

const MCP = 'https://api.fudoki.dev/mcp'
const DOCS = 'https://docs.fudoki.dev'
const GITHUB = 'https://github.com/wwwyo/fudoki'

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`
// 億・万の表記。万未満は切り捨てるので、正確な額は title に yen で添える
const oku = (n: number) => {
  if (n === 0) return '0円'
  const o = Math.floor(n / 1e8)
  const m = Math.floor((n % 1e8) / 1e4)
  return `${o ? `${o}億` : ''}${m ? `${m.toLocaleString('ja-JP')}万` : ''}円`
}
const icon = (id: string) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`

const LOGO_G = `<g fill="currentColor"><g transform="translate(0 0) scale(1.25)"><rect x="2.00000000" y="14.00000000" width="4.00000000" height="14.00000000" rx="2.00000000"/><rect x="8.00000000" y="6.00000000" width="4.00000000" height="22.00000000" rx="2.00000000"/><rect x="14.00000000" y="18.00000000" width="4.00000000" height="10.00000000" rx="2.00000000"/><rect x="20.00000000" y="2.00000000" width="4.00000000" height="26.00000000" rx="2.00000000"/><rect x="26.00000000" y="11.00000000" width="4.00000000" height="17.00000000" rx="2.00000000"/><rect x="2.00000000" y="29.00000000" width="28.00000000" height="2.00000000" rx="1.00000000" fill="currentColor"/></g><path transform="translate(45.0775 33.5854) scale(0.03250 -0.03250)" d="M111 -71Q92 -55 63.0 -39.5Q34 -24 13 -15Q46 30 69.0 76.5Q92 123 106.5 178.5Q121 234 127.5 306.0Q134 378 134 472Q134 585 130.5 673.5Q127 762 123 811H843Q839 765 835.0 671.5Q831 578 831 449Q831 308 846.0 224.5Q861 141 886 100Q894 119 901.0 141.5Q908 164 913 184Q929 173 956.5 159.0Q984 145 999 139Q989 90 973.0 39.5Q957 -11 936 -46Q921 -71 893.5 -74.0Q866 -77 840 -48Q720 91 720 449Q720 509 720.5 565.0Q721 621 721.0 660.5Q721 700 721 711H237Q237 696 237.5 666.0Q238 636 238.5 599.5Q239 563 239.0 527.0Q239 491 239 464Q239 359 231.0 279.0Q223 199 207.5 137.0Q192 75 168.0 25.0Q144 -25 111 -71ZM684 -55Q668 -15 644 30Q606 22 552.5 12.5Q499 3 441.5 -5.5Q384 -14 334.0 -21.5Q284 -29 254 -32L227 72Q259 74 315.5 80.0Q372 86 434 93V218H279V500H434V554Q394 550 357.0 547.5Q320 545 290 543Q289 556 284.0 574.5Q279 593 273.5 610.5Q268 628 263 637Q307 638 359.5 642.5Q412 647 464.0 653.5Q516 660 560.5 669.0Q605 678 635 688L696 601Q662 591 619.0 582.5Q576 574 530 566V500H684V218H530V105Q548 107 564.5 110.0Q581 113 596 115Q588 128 579.5 139.5Q571 151 563 161L653 206Q674 179 698.5 140.0Q723 101 744.0 61.5Q765 22 777 -9Q758 -15 730.0 -29.0Q702 -43 684 -55ZM373 309H434V409H373ZM530 309H590V409H530Z"/><path transform="translate(79.5825 33.5854) scale(0.03250 -0.03250)" d="M45 -32V81H436V427H110V539H436V818H564V539H895V427H564V81H960V-32Z"/><path transform="translate(112.6250 33.5854) scale(0.03250 -0.03250)" d="M617 -55Q555 -55 529.5 -36.0Q504 -17 504 28V500H792V700H495V805H914V391H626V88Q626 73 633.5 66.5Q641 60 664 60H781Q808 60 823.0 70.0Q838 80 845.0 105.5Q852 131 856 177Q869 170 890.0 161.5Q911 153 933.5 146.0Q956 139 972 135Q961 56 943.5 15.0Q926 -26 896.0 -40.5Q866 -55 815 -55ZM92 -55V237H416V-55ZM51 570V661H451V570ZM99 710V804H407V710ZM99 288V380H407V288ZM99 429V521H407V429ZM199 36H309V145H199Z"/></g>`
const logo = (cls: string) => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 146.2150 40" role="img" aria-label="風土記"><title>風土記</title>${LOGO_G}</svg>`

const { nakano, ledgers, origin, library } = HOME
const libraryMax = Math.max(...library.rows.map((r) => r.amount))

/** 色・字・角の token。会話の画面（chat-shell.ts）も同じものを使う */
export const TOKENS_CSS = `
@font-face{font-family:"Fudoki Mincho";src:url("/fonts/mincho.woff2") format("woff2");font-weight:400;font-display:swap}
:root{
--background:#fdfcfa;--foreground:#2b2723;--card:#f8f5ee;--card-foreground:#2b2723;
--secondary:#ece6da;--secondary-foreground:#2b2723;--muted:#ece6da;--muted-foreground:#6b655c;
--primary:#2f5d43;--primary-foreground:#f8f5ee;--accent:#e9efe9;--accent-foreground:#2f5d43;
--border:#ddd6c8;--ring:#2f5d43;--logo-rule-ink:#29523b;
--paper:#e4d8bf;--paper-foreground:#2b2723;--night:#2b2723;--night-foreground:#f8f5ee;
--page:#ffffff;--page-foreground:#2b2723;
--shu:#c1553a;--ai:#33507a;--kincha:#e3a43c;--sakura:#ebcab9;
--font-display:"Fudoki Mincho","BIZ UDPMincho","Hiragino Mincho ProN","Yu Mincho",serif;
--font-sans:"Hiragino Sans","Noto Sans JP","Yu Gothic UI","Yu Gothic",Meiryo,system-ui,sans-serif;
--font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
--radius:8px;--radius-sm:4px;--radius-card:16px;--radius-sheet:24px;
--gut:max(24px,calc((100% - 1200px) / 2));
--hair:color-mix(in srgb,var(--foreground) 10%,transparent);
--shadow-sheet:0 20px 25px -5px color-mix(in srgb,var(--night) 12%,transparent),0 8px 10px -6px color-mix(in srgb,var(--night) 10%,transparent);
--shadow-pill:0 1px 2px color-mix(in srgb,var(--night) 4%,transparent),0 6px 20px color-mix(in srgb,var(--night) 6%,transparent);
--ease:cubic-bezier(.4,0,.2,1);--ease-sweep:cubic-bezier(.87,0,.13,1);
--grain:.32;--halftone:7px;--rays:28;
--noise:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-color-scheme:dark){:root{
--background:#1b1916;--foreground:#ece6da;--card:#24211d;--card-foreground:#ece6da;
--secondary:#302c26;--secondary-foreground:#ece6da;--muted:#302c26;--muted-foreground:#a8a094;
--primary:#8fbfa2;--primary-foreground:#1b1916;--accent:#26332b;--accent-foreground:#8fbfa2;
--border:#3b362f;--ring:#8fbfa2;--logo-rule-ink:#9cc7ad;
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
a{color:inherit;text-decoration:none}
a:focus-visible,button:focus-visible,summary:focus-visible,video:focus-visible{outline:3px solid color-mix(in srgb,var(--ring) 50%,transparent);outline-offset:2px;border-radius:var(--radius-sm)}
code{font:13px/1.6 var(--font-mono);letter-spacing:0;overflow-wrap:anywhere}
.i{display:block;flex:none;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
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

:root{scroll-padding-top:72px}
.nav{position:sticky;top:8px;z-index:20;padding-inline:calc(var(--gut) - 8px)}
.bar{display:flex;align-items:center;height:56px;padding:0 8px 0 14px;border:.5px solid transparent;border-radius:999px;transition:background-color .3s ease-out,border-color .3s ease-out,box-shadow .3s ease-out}
.nav[data-scrolled] .bar{border-color:var(--border);background:var(--background);box-shadow:var(--shadow-pill)}
.nav .logo{height:28px}
.links{display:flex;gap:28px;margin-inline:auto;font-size:14px}
.links a{transition:color 150ms var(--ease)}
.links a:hover{color:var(--muted-foreground)}
.right{display:flex;gap:6px}
.right .btn{height:36px;padding:0 14px;font-size:14px;font-weight:400}
.right .gh{border-color:var(--border);background:var(--background);color:var(--foreground)}
.right .gh:hover{background:var(--card)}

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
body.ask-docked{padding-bottom:112px}
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

.mcp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:64px;align-items:center;padding-block:96px;background:var(--paper);color:var(--paper-foreground)}
.mcp h2{margin-top:16px;font-size:clamp(2.25rem,1.5rem + 3vw,4.25rem);line-height:1.25;color:var(--paper-foreground)}
.mcp .eyebrow{color:var(--paper-foreground)}
.howto{margin-top:24px;border-top:1px solid color-mix(in srgb,var(--paper-foreground) 25%,transparent)}
.howto li{display:grid;grid-template-columns:2em 1fr;gap:12px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--paper-foreground) 25%,transparent);font-size:15px;line-height:1.7}
.howto b{font:400 15px/1.7 var(--font-display)}
.demo{display:grid;gap:14px}
.demo video{display:block;width:100%;height:auto;aspect-ratio:1280/840;border-radius:var(--radius-card);background:color-mix(in srgb,var(--paper-foreground) 12%,transparent);box-shadow:var(--shadow-sheet)}
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

footer{padding-top:96px}
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
.links{display:none}
.right{margin-left:auto}
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
@media (min-width:961px){:root{--gut:max(56px,calc((100% - 1200px) / 2))}html[data-snap]{scroll-snap-type:y mandatory}#mcp{scroll-snap-align:start}.ledger-stage{scroll-snap-align:end}}
@media (prefers-reduced-motion:no-preference){
html{scroll-behavior:smooth}
.sweep.in{animation:sweep 1.4s var(--ease-sweep) both}
@keyframes sweep{from{background-position:100% 0}to{background-position:0 0}}
}
@media (prefers-reduced-motion:reduce){.rail *{transition:none}}
`

const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
<symbol id="arrow-right" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></symbol>
<symbol id="file-text" viewBox="0 0 24 24"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></symbol>
<symbol id="plug" viewBox="0 0 24 24"><path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/></symbol>
</svg>`

const ledgerRows = (l: (typeof ledgers)[number]) =>
  [
    `<tr class="k"><td><span class="lv">款</span>${l.kan.name}</td><td></td><td class="n">${yen(l.kan.amount)}</td><td class="n">${l.kan.page}頁</td></tr>`,
    `<tr class="ko"><td><span class="lv">項</span>${l.kou.name}</td><td></td><td class="n">${yen(l.kou.amount)}</td><td class="n">${l.kou.page}頁</td></tr>`,
    ...l.moku.flatMap((m) => [
      `<tr class="mo"><td><span class="lv">目</span>${m.name}</td><td><span class="tag">${m.cofog}</span></td><td class="n">${yen(m.amount)}</td><td class="n">${m.page}頁</td></tr>`,
      ...m.detail.map((d) => `<tr class="su"><td><span class="lv">${d.kind}</span>${d.name}</td><td></td><td class="n">${yen(d.amount)}</td><td class="n">${d.page}頁</td></tr>`),
    ]),
  ].join('')

const ledgerTables = ledgers
  .map(
    (l, i) =>
      `<table class="tbl"${i ? '' : ' data-pos="cur"'}><caption>${l.jurisdiction} · ${nakano.period} · 一般会計</caption>
<thead><tr><th scope="col">科目</th><th scope="col">COFOG</th><th scope="col" class="n">支出済額</th><th scope="col" class="n">原典</th></tr></thead>
<tbody>${ledgerRows(l)}</tbody></table>`,
  )
  .join('')

// 原典の切り抜きの上に、印字の位置を % で重ねる（3pt の余白を付ける）
const [cx0, cy0, cx1, cy1] = origin.crop
const [mx0, my0, mx1, my1] = origin.mark
const pct = (v: number, w: number) => `${((v / w) * 100).toFixed(2)}%`
const markStyle = `left:${pct(mx0 - 3 - cx0, cx1 - cx0)};top:${pct(my0 - 3 - cy0, cy1 - cy0)};width:${pct(mx1 - mx0 + 6, cx1 - cx0)};height:${pct(my1 - my0 + 6, cy1 - cy0)}`

const BODY = `${ICONS}
<nav class="nav" aria-label="サイト"><div class="bar">
<a href="/" aria-label="風土記 ホーム">${logo('logo')}</a>
<div class="links"><a href="#how">しくみ</a><a href="#mcp">AI から使う</a><a href="${DOCS}">ドキュメント</a><a href="#faq">よくある質問</a></div>
<div class="right"><a class="btn gh" href="${GITHUB}">GitHub</a></div>
</div></nav>
<main>
<header class="hero wrap">
<p class="eyebrow">風土記 — 町の家計簿</p>
<h1 class="sweep">あなたの街は、何にいくら使ったか</h1>
<p class="sub">自治体の予算書と決算書を、事業の単位まで表にしました。AI に聞けば、他の街や他の年と同じ物差しで比べ、原典の頁まで返します。</p>
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
<ol><li><a href="#see" aria-current="step"><b>一</b><span><strong>見る</strong><small>款・項・目から、その下の事業まで</small></span></a></li><li><a href="#compare"><b>二</b><span><strong>比べる</strong><small>COFOG で、街をまたいで並べる</small></span></a></li><li><a href="#check"><b>三</b><span><strong>確かめる</strong><small>原典の頁と、印字の位置で</small></span></a></li></ol>
</nav>
<div>
<article class="step" id="see"><span class="k">ステップ一　見る</span><h3>一つの街の支出を、事業の単位で</h3>
<p>款・項・目と、その下の事業まで、原典の階層を保ったまま引けます。予算案・当初・補正後・決算は、金額の段階として分けて持ちます。</p>
<div class="stage"><div class="art paper" aria-hidden="true"><i style="right:-20px;top:-30px">見</i><s></s></div>
<div class="win"><h4 class="win-h">${nakano.jurisdiction}の款 · ${nakano.period}</h4>
<div class="lines">${nakano.kanList.map((k) => `<div class="r"><span>${k.name}</span><span class="num" title="${yen(k.amount)}">${oku(k.amount)}</span></div>`).join('')}</div></div></div>
</article>
<article class="step" id="compare"><span class="k">ステップ二　比べる</span><h3>別の街と、同じ物差しで</h3>
<p>款の名前は街ごとに違います。中野区には「民生費」という款がありません。だから目ごとに政府支出の国際分類（COFOG）を割り当て、街をまたいで並べられるようにしています。</p>
<div class="stage"><div class="art burst" aria-hidden="true"></div>
<div class="win"><h4 class="win-h">目「${library.name}」 · COFOG ${library.cofog}</h4>
<div class="bars">${library.rows.map((r) => `<div class="b"><span>${r.jurisdiction}</span><i style="width:${((r.amount / libraryMax) * 100).toFixed(1)}%" aria-hidden="true"></i><span class="num" title="${yen(r.amount)}">${oku(r.amount)}</span></div>`).join('')}</div>
<p class="muted" style="font-size:12px">${library.period}。人口あたりの額ではありません。</p></div></div>
</article>
<article class="step" id="check"><span class="k">ステップ三　確かめる</span><h3>怪しい数字は、原典の頁で</h3>
<p>明細ごとに原典の頁と印字の位置を持ち、分類が確かか・仮か・できないかも返します。数字に引っかかったら、その頁を開けば確かめられます。</p>
<div class="stage pdf"><div class="art oats" aria-hidden="true"><i style="left:-30px;top:-40px">確</i></div>
<figure class="sheet"><figcaption><span>${origin.jurisdiction} · ${origin.document}</span><span class="num">PDF ${origin.page}頁</span></figcaption>
<div class="crop"><img src="/home/origin.webp" width="2136" height="879" loading="lazy" alt="${origin.jurisdiction}の決算書 ${origin.page}頁の切り抜き。目「${origin.name}」の支出済額 ${yen(origin.amount)}"><i class="mark" style="${markStyle}" aria-hidden="true"></i></div>
<p>目「${origin.name}」の支出済額 <b class="num">${yen(origin.amount)}</b><small>囲みは、API が返す印字の位置</small></p></figure></div></div>
</article>
</div></div>
</section>

<section class="mcp wrap" id="mcp" aria-labelledby="mcp-h">
<div><p class="eyebrow">AI から使う</p><h2 id="mcp-h">URL を一つ登録するだけ</h2>
<ol class="howto"><li><b>一</b><span>MCP に対応した AI クライアントの設定を開く</span></li><li><b>二</b><span><code>${MCP}</code> を登録する（認証は要りません）</span></li><li><b>三</b><span>「北区に住んでいます。何の予算が見れますか？」と聞く</span></li></ol></div>
<figure class="demo">
<video src="/home/demo.mp4" poster="/home/demo-poster.webp" width="1280" height="840" muted loop playsinline preload="none" tabindex="0" aria-label="ChatGPT から風土記の MCP に、北区の決算を聞いた操作の録画。Enter で再生・停止"></video>
<figcaption><a href="${DOCS}/mcp">MCP の使い方を見る${icon('arrow-right')}</a></figcaption>
</figure>
</section>

<section class="sec wrap faq" id="faq" aria-labelledby="faq-h"><h2 id="faq-h">よくある質問</h2><div>
<details open><summary>数字はどこから来ていますか</summary><p>自治体が公開した予算書・決算書（PDF または CSV）です。表に読み込んだあと、原典の中で重ねて印字された合計どうしが一致するかを確かめています。明細ごとに、原典の頁と印字された位置を持っています。</p></details>
<details><summary>予備費が 0 円なのは、使わなかったからですか</summary><p>いいえ。決算の予備費は、他の科目へ充用したあとの支出済額なので 0 円になります。どこへ充用したかは原典の備考にあり、風土記では金額の注記として科目の金額とは別に持ちます。</p></details>
<details><summary>COFOG の分類は正しいのですか</summary><p>分類は原典にない、風土記の判断です。確かなもの・仮のもの・分類できないものを区別して返し、分類できない明細も合計から落としません。</p></details>
<details><summary>どの自治体・年度が入っていますか</summary><p>収録する自治体と年度は、順次広げています。いま入っている範囲は、AI に聞くか<a href="${DOCS}">ドキュメント</a>で確かめられます。収録していないことは、支出がゼロであることを意味しません。</p></details>
<details><summary>使うのにお金や登録は要りますか</summary><p>要りません。MCP の URL を AI クライアントに登録すれば使えます。詳しくは<a href="${DOCS}/terms">利用規約</a>をご覧ください。</p></details>
</div></section>
</main>

<footer class="wrap">
<div class="cols">
<div><a href="/" aria-label="風土記 ホーム">${logo('logo')}</a><p>町の家計簿。自治体の歳出を、事業の単位まで。</p></div>
<div><h2>使う</h2><ul><li><a href="#mcp">AI から使う</a></li><li><a href="${DOCS}">ドキュメント</a></li></ul></div>
<div><h2>作り</h2><ul><li><a href="${GITHUB}">GitHub</a></li><li><a href="${DOCS}/support">サポート</a></li><li><a href="mailto:support@fudoki.dev">お問い合わせ</a></li></ul></div>
<div><h2>決まりごと</h2><ul><li><a href="${DOCS}/privacy">プライバシーポリシー</a></li><li><a href="${DOCS}/terms">利用規約</a></li></ul></div>
</div>
<div class="legal"><span>713年、諸国に同じ様式で報告させた地誌にならって</span><span>© 2026 風土記</span></div>
</footer>`

// nav の浮き、見出しの sweep、3つのステップの現在地。どれも無くても読める
const SCRIPT = `const n=document.querySelector('.nav'),sp=document.querySelector('.steps'),h=document.documentElement;const s=()=>{n.toggleAttribute('data-scrolled',scrollY>24);const b=sp.getBoundingClientRect();h.toggleAttribute('data-snap',b.top<=1&&b.bottom>=innerHeight-1)};addEventListener('scroll',s,{passive:true});s();
if('IntersectionObserver'in window){const o=new IntersectionObserver(l=>l.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');o.unobserve(e.target)}}),{threshold:.6});document.querySelectorAll('.sweep').forEach(e=>o.observe(e));
const r=document.querySelector('.rail'),t=[...document.querySelectorAll('.rail a')],st=[...document.querySelectorAll('.step')];const p=new IntersectionObserver(l=>l.forEach(e=>{if(e.isIntersecting){const i=st.indexOf(e.target);r.style.setProperty('--at',i);t.forEach((a,j)=>j===i?a.setAttribute('aria-current','step'):a.removeAttribute('aria-current'))}}),{rootMargin:'-45% 0px -45% 0px'});st.forEach(e=>p.observe(e))}
const rm=matchMedia('(prefers-reduced-motion: reduce)').matches,lg=document.querySelector('.ledger');if(lg&&!rm&&'IntersectionObserver'in window){const ts=[...lg.querySelectorAll('.tbl')],ro=lg.querySelector('.roll-in'),ns=[...ro.children],n=ts.length;let i=0,id=0,vis=false;const fit=()=>{ro.parentElement.style.width=ns[i].offsetWidth+'px'};fit();document.fonts&&document.fonts.ready.then(fit);
ro.addEventListener('transitionend',()=>{if(i===n){ro.style.transition='none';i=0;ro.style.setProperty('--r',0);ro.offsetWidth;ro.style.transition=''}});
const step=()=>{i++;ro.style.setProperty('--r',i);fit();ts.forEach((t,k)=>k===i%n?t.dataset.pos='cur':delete t.dataset.pos)};
const run=()=>{clearInterval(id);if(vis)id=setInterval(step,2000)};
new IntersectionObserver(l=>{vis=l[0].isIntersecting;run()}).observe(lg)}
const v=document.querySelector('.demo video');if(v){let user=rm;const tg=()=>{if(v.paused){user=false;v.play()}else{user=true;v.pause()}};v.addEventListener('click',tg);v.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tg()}});
if('IntersectionObserver'in window)new IntersectionObserver(l=>{if(l[0].isIntersecting){if(!user)v.play().catch(()=>{})}else v.pause()},{threshold:.4}).observe(v)}`

const DESCRIPTION = '日本の自治体の歳出の予算・決算を事業の単位まで集め、AI から問い合わせられるデータとして配る。'

export const LANDING_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>風土記（fudoki）— 町の家計簿</title>
<meta name="description" content="${DESCRIPTION}">
<meta name="theme-color" content="#fdfcfa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b1916" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="https://fudoki.dev/">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
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
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"風土記（fudoki）","url":"https://fudoki.dev/","logo":"https://fudoki.dev/icon.png","sameAs":["https://github.com/wwwyo/fudoki","https://docs.fudoki.dev/"]}</script>
<style>${CSS}</style>
<link rel="stylesheet" href="/_app/start.css">
<script type="module" src="/_app/start.js"></script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
</head>
<body>
${BODY}
<script>${SCRIPT}</script>
</body>
</html>
`

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32.0000 32" role="img" aria-label="風土記">
  <title>風土記</title><style>svg { color: #2f5d43; --logo-rule-ink: #29523b; } @media (prefers-color-scheme: dark) { svg { color: #8fbfa2; --logo-rule-ink: #9cc7ad; } }</style>
  <g fill="currentColor"><g transform="translate(0 0) scale(1)"><rect x="2.00000000" y="14.00000000" width="4.00000000" height="14.00000000" rx="2.00000000"/><rect x="8.00000000" y="6.00000000" width="4.00000000" height="22.00000000" rx="2.00000000"/><rect x="14.00000000" y="18.00000000" width="4.00000000" height="10.00000000" rx="2.00000000"/><rect x="20.00000000" y="2.00000000" width="4.00000000" height="26.00000000" rx="2.00000000"/><rect x="26.00000000" y="11.00000000" width="4.00000000" height="17.00000000" rx="2.00000000"/><rect x="2.00000000" y="29.00000000" width="28.00000000" height="2.00000000" rx="1.00000000" style="fill:var(--logo-rule-ink)"/></g></g>
</svg>
`
