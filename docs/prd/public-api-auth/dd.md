# 公開の REST・MCP に認証をかける — 設計

担当者: wwwyo / Claude
更新日: `2026-11-13`
状態: Draft（別の agent のレビューを反映済み。未決事項は yuito の判断待ち）

## Summary

[ADR 0044](../../adr/0044-separate-web-and-public-api.md) の 4・5 を実装する。公開の REST（`/v1/*`）と MCP（`/mcp`）を、ログインした利用者だけが使えるようにし、呼び出しを利用者ごとに記録して流量を制限する。

ログインと資格情報の発行は風土記の中に作らない。風土記のデータを使う他のサービス（補助金の検索など）と共通の認証基盤にする。認証は WorkOS AuthKit に任せ、ログインは Google だけで始める。開発者がキーを発行する頁は、風土記の外の非公開 repo に置く。風土記の api は、届いた資格情報を検証して利用者の ID を取り出すだけにする。

## 今の形

- `/v1/*` と `/mcp` は匿名で読める。`/v1/*` は CORS `*`。
- 流量の制限は Cloudflare の WAF の IP あたり 20回/10秒だけ。呼び出し元は記録していない（api はエラーしかログに出さない）。
- web は内部の RPC（`Web`・`SourcePages`）だけで読む（#605）。この設計の影響を受けない。
- 出典の PDF の中継（`/v1/expenditures/origins/{id}/pdf`）は ADR 0044 の 8 により認証なし・CORS `*` のまま残す。
- ChatGPT の plugin は掲載済み、Claude の connector は審査中で、どちらも認証なしで繋いでいる（[submission](../mcp-distribution/submission.md)）。

## Goals / Non-Goals

- Goal: `/v1/*`（PDF の中継を除く）と `/mcp` は、有効な資格情報が無ければ 401 を返す。
- Goal: MCP は OAuth だけで繋ぐ。claude.ai・ChatGPT などは利用者が Google でログインして承認すれば使える。
- Goal: REST は API キーで呼べる（ADR 0044 の 4）。OAuth のトークンは MCP だけで受ける。
- Goal: 呼び出しを利用者ごとに記録し、利用者ごとに流量を制限する。
- Goal: 補助金などの別のサービスも、同じログイン・同じ利用者 ID を使える。
- Non-Goal: web の閲覧・アシスタントにログインを求めること。web は今のまま誰でも使える。
- Non-Goal: 有料のプランや課金。商用での利用は今と同じく問い合わせで受ける。
- Non-Goal: Google 以外のログイン手段。

## 全体の形

```
開発者のブラウザ ──ログイン──▶ WorkOS AuthKit（Google）
        │                              ▲
        └── キーの発行・失効 ──▶ アカウントの頁（非公開 repo、WorkOS の API Keys widget）

MCP の client（claude.ai など）──OAuth（CIMD / DCR、PKCE）──▶ AuthKit ──access token（JWT）
        │
        └── Authorization: Bearer <JWT> ──▶ api.fudoki.dev/mcp ──JWKS で検証

REST の client ── Authorization: Bearer <API キー> ──▶ api.fudoki.dev/v1/*
                                         │
                                         └── キーは WorkOS の検証 API で確かめ、結果を短時間キャッシュ
```

役割は三つに分ける。

| 部分 | 置き場 | 持つもの |
| --- | --- | --- |
| WorkOS AuthKit | WorkOS（外部サービス） | 利用者・Google のログイン・OAuth の認可サーバー・API キーの保管と検証 |
| アカウントの頁 | 風土記の外の非公開 repo（Worker 1つ） | 開発者のログイン、キーの発行・一覧・失効（API Keys widget） |
| 各サービスの API（風土記の `apps/api` など） | 各 repo | 資格情報の検証、利用者 ID ごとの記録と流量の制限 |

各サービスの D1 に置くのは WorkOS の利用者 ID（`user_…`）だけにする。名前・メールアドレスは WorkOS に置き、サービスの D1 には写さない。

## 判断

### 認証基盤

- WorkOS AuthKit の production 環境を1つ作り、風土記と今後のサービスで共有する。サービスごとに環境を分けない（分けると同じ人が別人になる）。
- ログインは Google だけを有効にする。メール・パスワード・magic link は無効にする。
- ログインの画面は AuthKit の hosted UI を使い、WorkOS の既定のドメインで出す。独自ドメイン（$99/月）は利用者が増えてから検討する。
- WorkOS のアカウント・環境・secret は yuito が持つ。

### MCP（OAuth）

- AuthKit を認可サーバーにする。WorkOS の Connect で CIMD（Client ID Metadata Documents）を有効にし、DCR も古い client のために有効にする。MCP の規格（2026-07-28）では CIMD が SHOULD、DCR は互換のための MAY（非推奨）。
- MCP の URL は今の `api.fudoki.dev/mcp` のまま変えない。匿名の期間は設けず、切り替えた時点で認証を必須にする（client は 401 を受けて初めて OAuth を始めるので、同じ URL で匿名と認証つきを並べられない）。
- Resource Indicator に `https://api.fudoki.dev/mcp` を登録し、既定の Resource Indicator にもする。
- api は `https://api.fudoki.dev/.well-known/oauth-protected-resource/mcp` で次を返す（RFC 9728 の 3.3 により、`resource` は well-known の接尾辞を除いた URL と一致させる）。`scopes_supported` は書かない。

  ```json
  {
    "resource": "https://api.fudoki.dev/mcp",
    "authorization_servers": ["https://<authkit のドメイン>"],
    "bearer_methods_supported": ["header"]
  }
  ```

- トークンが無い・不正・期限切れのときは 401 と `WWW-Authenticate: Bearer resource_metadata="https://api.fudoki.dev/.well-known/oauth-protected-resource/mcp"` を返す。
- 検証は `jose` の `jwtVerify` で、JWKS（`https://<authkit のドメイン>/oauth2/jwks`、`createRemoteJWKSet` が Worker の isolate の中でキャッシュする）・`iss`・`aud`（`https://api.fudoki.dev/mcp` だけ）・`exp` を確かめる。`sub` を利用者 ID にする。WorkOS の文書に従い、`sub_profile` が `ai_agent` のトークンは拒む。
- scope は使わない。読み取り専用で、権限を分ける操作が無いため。書き込みの tool を足すときに scope を決める。
- access token の寿命は AuthKit の既定（5 分）のまま。refresh token には期限が無いので、利用を止めさせるのは WorkOS で利用者か承認を消すことで行う。

### REST（API キー）

- 資格情報は `Authorization: Bearer <API キー>` だけで受ける。OAuth のトークンは受けない（MCP の resource 向けのトークンを別の resource で受けないため）。
- 401 には `WWW-Authenticate: Bearer` を付け、資格情報が無効なときは `error="invalid_token"` も付ける（RFC 6750）。`resource_metadata` は MCP だけに付ける。
- query string に資格情報らしい値（`api_key`・`key`・`token`・`access_token`）が付いた要求は、値を使わずに 400 を返す。
- Workers Logs の invocation log と traces は要求の URL を記録するので、`apps/api/cloudflare.config.ts` の `observability` に `redactQueryString: true` を足し、URL から query string を落とす。invocation log と traces は切らない。
- WorkOS のキーの接頭辞が無い値と、長さが上限（実際のキーで確かめて決める）を超える値は WorkOS を呼ばずに 401 にする。長さは固定しない。
- 形式が合う値は、WorkOS の検証 API（`POST https://api.workos.com/api_keys/validations`）で確かめる。`api_key.owner.type` が `user`、`owner.organization_id` が developers、permission に `fudoki:read` があることを確かめ、`owner.id` を利用者 ID にする。api の Worker に secret `WORKOS_API_KEY` を置く。
- 検証の結果（通す: 利用者 ID／401: 無効／403: 理由つきの拒否）は、キーの SHA-256 を鍵にして Workers の Cache API に 5 分置く。失効や permission の追加が効くまで最長 5 分かかる。Cache API は data center ごとで複製されないので、拠点が変わると WorkOS を呼び直す。キーの値そのものはキャッシュの鍵にもログにも残さない。
- 検証に失敗した要求には、IP ごとの上限（Rate Limiting binding、10 回/60 秒）をかける。でたらめなキーで WorkOS の呼び出しの上限を使い切らせないため。
- WorkOS の 5xx・timeout と JWKS が取れないときは 503 を返し、結果をキャッシュしない（401 を返すと client が再認可を繰り返す）。
- `WORKOS_API_KEY` は WorkOS の利用者の削除やキーの発行もできる。権限を絞った key を作れるかを実装の前に確かめ、作れなければ api の Worker の secret をこの1本に限り、rotate の手順を運用に書く。
- WorkOS の API キーは organization に属する必要がある。全利用者が入る organization を1つ（「developers」）作り、アカウントの頁に初めてログインしたときに入れる。キーは user scope で発行し、本人のキーだけを管理できる役割（`widgets:user-api-keys:manage-self`）を与える。
- キーの permission でサービスを分ける。風土記は `fudoki:read` を持つキーだけを受ける。補助金のサービスは別の permission にする。

### 適用する範囲と順序

- 認証は `/v1/*`（PDF の中継を除く）と `api.fudoki.dev/mcp` にかける。`/`・`/health`・`/openapi.json`・`/robots.txt`・`/.well-known/*` はかけない。
- 認証の middleware は kill switch（D1 を読む）より前に置く。資格情報の無い要求は D1 を読まずに 401 を返す。
- 検証した利用者 ID と資格情報の種類（`api_key`・`oauth`）、OAuth の場合は client ID を、request の context（`c.var.caller`）に置く。問い合わせの処理（`queries.ts`・`model.ts`）には渡さない。
- `/v1/*` の CORS は外す。キーをブラウザの JavaScript に置かせないため。PDF の中継の CORS `*` は残す。

### 記録と流量の制限

- 呼び出しは Workers Analytics Engine に1要求1行で書く。列は 利用者 ID・資格情報の種類・OAuth の client ID・route または MCP の tool 名・status・処理時間。IP・User-Agent・問い合わせの引数は書かない。Analytics Engine の保持期間（3か月）を超えて残さない。
- 流量の制限は Workers の Rate Limiting binding で、利用者 ID を鍵にする。最初の値は 60 回/60 秒にし、運用を見て変える。binding は拠点ごとに近似で数えるので、上限は拠点ごとの目安になる。WAF の IP ごとの制限は残すが、同じ IP を共有する利用者（社内の NAT・CI）が利用者ごとの上限より先に止まらないよう、値を今より十分大きくする。
- 商用で問い合わせた利用者の上限を上げるときは、WorkOS の利用者の metadata に上限の区分を置き、api が検証の結果と一緒に読む。最初は区分を1つだけにし、仕組みは作らない。

### アカウントの頁（非公開 repo）

- 風土記の外に repo と Worker を1つ作る。repo 名・ドメインは未定（下の未決事項）。
- 持つ機能は、Google でのログインと、キーの発行・一覧・失効（WorkOS の API Keys widget を user scope で使う）だけにする。自分の呼び出し回数の表示は、Analytics Engine を読む token が要るので後回しにする。
- 利用者の削除（退会）は、WorkOS の利用者を消すことで行う。キーは organization の所属が消えると失効する。OAuth の承認は利用者の削除で消える。

## 移行の順序

1. WorkOS の環境を作る（Google のログイン、Connect の CIMD・DCR、Resource Indicator、developers の organization、API キーの permission）。
2. アカウントの頁を作って公開する。
3. api に認証・記録・流量の制限を入れ、`/mcp` と `/v1/*` を同時に認証必須に切り替える。匿名の猶予は設けない。
4. 同じ PR で docs.fudoki.dev・llms.txt・`/.well-known/mcp/server-card.json`・agent readiness の案内・plugin bundle（`plugins/fudoki`）・OpenAPI（`OPENAPI_CONFIG` に `http`/`bearer` の securityScheme、PDF の中継以外の operation に `security`。docs.fudoki.dev のリファレンスはここから作られる）・[policies](../mcp-distribution/policies.md)・privacy・terms・[submission](../mcp-distribution/submission.md)（「アカウント・API key は不要」と審査の test case）を認証つきに直す。
5. ChatGPT のアプリと Claude の connector を OAuth の設定で出し直し、審査を受ける。審査用には専用の Google アカウントを作って渡す。OpenAI は MFA・確認コードなしで入れるテスト用のアカウントを求めるが、Google は見慣れない端末からのログインに本人確認を求めることがある。それで差し戻されたら、審査の通し方を yuito と決め直す（AuthKit のパスワードのログインを審査用のアカウントだけに限れるかは確かめていない。全員に開くなら Google だけという決定を変えることになる）。3 から審査が通るまで、ChatGPT に掲載中のアプリは使えない（2026-11-13 yuito 了承）。

## テスト

AGENTS.md の方針に従い、公開 API の安全性に当たるものを unit テストにする。

- MCP: 資格情報が無い・壊れている・期限切れ・`aud` が違う・`iss` が違う JWT・`sub_profile` が `ai_agent` の JWT は 401 で、`WWW-Authenticate` に `resource_metadata` が付く。
- REST: OAuth のトークン・形式の違う値・無効な API キーは 401。有効なキーは通り、2回目は WorkOS を呼ばない（キャッシュ）。
- organization scope のキー・developers 以外の organization のキー・`fudoki:read` を持たないキーは 403。
- query string に資格情報が付いた要求は 400。
- WorkOS・JWKS が落ちているときは 503 で、キャッシュに残らない。
- PDF の中継・`/health`・`/.well-known/oauth-protected-resource/mcp` は資格情報なしで通る。
- 資格情報の無い要求で D1 を読まない。
- アプリの `console` のログにキーの値が出ない。invocation log・traces に出ないことは、移行の 3 で本番に `?api_key=` を投げ、Workers Logs に保存された URL に query が無いことで確かめる（`wrangler tail` では確かめない）。
- `/openapi.json` が Bearer の securityScheme を持ち、PDF の中継以外の operation に `security` が付く。

JWT の検証は、テストで作った鍵の JWKS を渡して確かめる。WorkOS の検証 API は fetch を差し替える。

## 未決事項

- アカウントの頁の repo 名とドメイン（風土記と補助金で共通の名前にするか）。
- ChatGPT・Claude の client が CIMD と DCR のどちらで来るか。両方を有効にするので動作は変わらないが、5 で確かめる。

## 参考

- [MCP Authorization（2026-07-28）](https://modelcontextprotocol.io/specification/latest/basic/authorization)
- [WorkOS AuthKit の MCP の文書](https://workos.com/docs/authkit/mcp)
- [WorkOS の API Keys](https://workos.com/docs/authkit/api-keys)
- [WorkOS の料金](https://workos.com/pricing)
