# Cloudflare のゾーン設定

- Browser Integrity Check（BIC）は Bot Fight Mode とは別の機能で、既定で ON。Python の `urllib` の既定の UA を `error code: 1010` で弾く。非ブラウザのクライアントが使う公開 API のゾーン（fudoki.dev）では OFF にする。設定はゾーン全体のトグル（Security → Settings）で行う。
