// 会話の画面（/s/:id）の殻。中身は React の SPA（chat/session.tsx、/_app/session.js）が描く。会話の本文はブラウザの外に出さない。
import { TOKENS_CSS } from './landing'
import { THEME_COLOR_META } from './tokens'
import { PWA_HEAD, PWA_REGISTER } from './pwa'

export const CHAT_SHELL_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>風土記に聞く</title>
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
${THEME_COLOR_META}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${PWA_HEAD}
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>${TOKENS_CSS}</style>
<link rel="stylesheet" href="/_app/session.css">
<script type="module" src="/_app/session.js"></script>
</head>
<body>
<div id="chat-session"><noscript>会話には JavaScript を有効にしてください。</noscript></div>
${PWA_REGISTER}
</body>
</html>
`
