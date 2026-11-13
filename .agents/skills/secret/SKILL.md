---
name: secret
description: fudoki の手元の secret（root の fnox.toml、age で暗号化）を使う・足す・変えるとき、メンバーや AI agent の鍵を足す・外すときに参照する。CI・deploy・Worker の secret は対象外（置き場だけ示す）。
user-invocable: false
---

# secret

fudoki の手元の secret の扱いの正本。置き場の規則は root の AGENTS.md の「secret」が持ち、ここは手順と理由を持つ。

## 仕組み

手元で使う secret は root の `fnox.toml` に age で暗号化して commit する（[fnox](https://fnox.jdx.dev/)、mise で入る）。値は `recipients` に並べた公開鍵の全員が、自分の秘密鍵で開ける。平文と秘密鍵は commit しない。この repo は public なので、暗号文は誰でも見られる。

- 鍵は fudoki 専用にする。個人の global の secret などを開ける鍵を recipients に入れない（漏れたときに fudoki 以外まで開くため）
- 各自の fudoki 用の秘密鍵は OS の keychain（service `fnox-fudoki`、account `age-key`）に置き、`fnox.toml` の `identity` がそこから読む
- shell に `FNOX_AGE_KEY` を export しない。export すると `identity` よりそちらが優先され、全 repo の fnox に同じ鍵が渡る

## 中身

- `TYPESAFE_API_KEY`: パイプラインの Jev の聞き直しに使う。fudoki 用に発行した key
- `ESTAT_APP_ID`: e-Stat API の appId。コードはまだ読まず、agent が統計表を API で引くときに使う

どちらも今は yuito のアカウントのもので、`TYPESAFE_API_KEY` はメンバーが使うと yuito の課金になる。メンバーが増えたら、共有を続けるか各自の key にするかを決める。

## 使う

`fnox exec --if-missing error -- <command>` で、その command にだけ env を渡す（例: `fnox exec --if-missing error -- bun run --cwd pipeline ingestion:convert ...`）。

- `--if-missing error` を付ける。無いと、復号できない値は警告だけ出て env に入らないまま command が走る
- `fnox get`・`fnox export`・`printenv` で値を画面や log に出さない

## 値を足す・変える

`fnox set <KEY>` を実行し、値は hidden prompt か stdin で渡す。引数に書くと shell の履歴に残る。

## メンバーを足す

1. 本人が fudoki 用の鍵を作って keychain に入れる。macOS では次の command で、公開鍵だけが表示される。

   ```bash
   d=$(mktemp -d) && age-keygen -o "$d/k" 2>/dev/null && age-keygen -y "$d/k" && security add-generic-password -U -s fnox-fudoki -a age-key -w "$(grep '^AGE-SECRET-KEY' "$d/k")"; rm -rf "$d"
   ```

2. 公開鍵（`age1...`）を `fnox.toml` の `recipients` に 1 行足す。行末のコメントで誰の鍵かを示す（fnox 1.46 は名前付きの表を読めない）
3. 鍵を持つ人が `fnox reencrypt -p age` で暗号文を作り直す

agent に渡すときも、専用の鍵を 1 本作って同じように足す。

## AI agent（cloud 環境）の鍵

recipients の `# ai` の行が AI agent 用の鍵。

- 秘密鍵は yuito の keychain（service `fnox-fudoki`、account `age-key-ai`）に置く。作り方はメンバーと同じで、account だけ変える
- cloud 環境の環境変数 `FNOX_AGE_KEY` に渡す。`FNOX_AGE_KEY` は `identity` より優先されるので、keychain の無い Linux でも開ける
- cloud 環境には mise を版固定で入れ、`mise.toml` の fnox を入れる。setup script は次のとおり

  ```bash
  curl -fsSL https://mise.run | MISE_VERSION=v2026.11.5 sh
  export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$PATH"
  mise trust --yes && mise install
  ```

- 止めるときは、行を消して `fnox reencrypt -p age` を実行し、cloud 環境の `FNOX_AGE_KEY` を消し、値を rotate する

## メンバーが抜ける

`recipients` から行を消し、`fnox reencrypt -p age` で作り直す。抜けた人は git 履歴の古い暗号文をまだ開けるので、値そのものも rotate する。

## fnox に入れないもの

- `CLOUDFLARE_ACCOUNT_ID` は secret ではないので、`mise.toml` の `[env]` に平文で置く
- `CLOUDFLARE_API_TOKEN` などの CI・deploy の secret は GitHub secret に置く
- 本番の Worker の secret（`TURNSTILE_SECRET_KEY` など）は Cloudflare に置く
- CI からは fnox を使わない。CI に `FNOX_AGE_KEY` を渡すと、その 1 本で全部が開くため
