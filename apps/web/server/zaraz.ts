// アクセス解析（Cloudflare Zaraz → GA4）のうちサーバーだけが使うもの。ブラウザ側の送信は analytics/zaraz.ts。設定（analytics/zaraz.json）を client の bundle に入れないよう分けてある
import managed from '../analytics/zaraz.json'

/** Zaraz を読み込む host。preview・手元では入れない */
export const ZARAZ_HOST = 'fudoki.dev'
/** Zaraz の自動差し込みは inline の script で CSP に止められるので切ってあり、同じ origin の script を </head> の直前に置く */
export const ZARAZ_SCRIPT = '<script src="/cdn-cgi/zaraz/i.js" referrerpolicy="origin"></script>'

/**
 * Zaraz（/cdn-cgi/zaraz/s.js）が頁の表示・zaraz.track のたびに挿す inline の script。中身は発火した trigger の記録だけで、GA4 への送信はサーバー側なので止まっても計測は欠けない。
 * nonce は ISR の HTML と両立しないので、決まった形の中身を hash で CSP に許す（server/csp.ts）。trigger を足したら zaraz.json から自動で増える
 */
const zarazRecord = (triggers: string[]) => `(function(w,d){${triggers.map((t) => `;w.zarazData.executed.push("${t}");`).join('')}})(window,document)`
export const zarazInlineScripts = () => [zarazRecord([]), zarazRecord(['Pageview']), ...Object.keys(managed.triggers).map((t) => zarazRecord(['AllTracks', t]))]
