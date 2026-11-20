// 住んでいるまちを選んだ人がホーム（/）を開いたら、そのまちの頁へ移す（2026-11-19 yuito）。
// 選んだまちはブラウザ（localStorage）にだけあるので、サーバーは HTML を書き分けず（CDN に置ける）、<head> の script が描く前に移す。
// 頁を読み直さずにホームへ来たとき（ロゴを押すなど）は home/home.tsx が移す。検索エンジンは localStorage を持たないので、ホームをそのまま読む
export const HOME_REDIRECT_SCRIPT = [
  `(function(){if(location.pathname!=='/')return;try{var c=localStorage.getItem('fudoki:home-jurisdiction');`,
  `var t=JSON.parse(localStorage.getItem('fudoki:home-town')||'null');`,
  `if(c&&t&&t.code===c&&typeof t.path==='string'&&/^\\/[a-z0-9-]+(\\/[a-z0-9-]+)*$/.test(t.path))location.replace(t.path)}catch(e){}})()`,
].join('')
