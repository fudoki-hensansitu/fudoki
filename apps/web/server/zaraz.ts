// アクセス解析（Cloudflare Zaraz → GA4）のうちサーバーだけが使うもの。ブラウザ側の送信は analytics/zaraz.ts。

/** Zaraz を読み込む host。preview・手元では入れない */
export const ZARAZ_HOST = 'fudoki.dev'
/** Zaraz の自動差し込みは切ってあり、同じ origin の script を </head> の直前に置く */
export const ZARAZ_SCRIPT = '<script src="/cdn-cgi/zaraz/i.js" referrerpolicy="origin"></script>'
