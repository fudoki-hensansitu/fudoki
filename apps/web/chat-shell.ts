// 会話の画面（/s/:id）の殻。中身は React の SPA（chat/session.tsx、/_app/session.js）が描く。会話の本文はブラウザの外に出さない。
import { TOKENS_CSS } from './landing'
import { THEME_COLOR_META } from './tokens'
import { PWA_HEAD, PWA_REGISTER } from './pwa'
import { withSiteNav, PAGE_TRANSITION_STYLE } from './nav/render'

/** open はサイドバーを開いて書くか（navOpen で cookie から決める） */
export const chatShellHtml = (open: boolean) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>風土記に聞く</title>
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
${THEME_COLOR_META}
${PAGE_TRANSITION_STYLE}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${PWA_HEAD}
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${TOKENS_CSS}</style>
<link rel="stylesheet" href="/_app/session.css">
<script type="module" src="/_app/session.js"></script>
</head>
<body>
${withSiteNav('<div id="chat-session"><noscript>会話には JavaScript を有効にしてください。</noscript></div>', { open })}
${PWA_REGISTER}
</body>
</html>
`
