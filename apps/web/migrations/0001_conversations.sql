-- 風土記の AI との会話の保存（server/chat-log.ts が書く）。あとで会話を開き直す（復元）のと、改善の分析の両方に使う。
-- 利用者を特定する情報（IP・UA・cookie）は持たない。user_id が空（ログインしていない）の会話は、最後の発言から90日を過ぎたら書くたびに消す
CREATE TABLE conversations (
  -- 会話の無作為な ID（/api/sessions が発行する）
  id TEXT PRIMARY KEY,
  -- ログインした利用者。認証を入れるまでは常に NULL
  user_id TEXT,
  -- 会話を始めた頁の path（/・/assistant・/tokyo/nakano など）
  entry TEXT NOT NULL,
  -- epoch ミリ秒
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX conversations_user ON conversations (user_id, updated_at);
CREATE INDEX conversations_updated_at ON conversations (updated_at);

-- 会話の発言。1往復で利用者（user）と AI（assistant）の2行
CREATE TABLE messages (
  conversation_id TEXT NOT NULL REFERENCES conversations (id),
  -- 会話の中の順番。n 回目の質問が 2n-1、その回答が 2n
  seq INTEGER NOT NULL,
  -- 画面の発言の ID（AI SDK の UIMessage の id）
  message_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  -- UIMessage の parts の JSON。質問の文と、AI の回答・tool の呼び出しと結果。質問・tool の引数・回答の文のメールアドレス・電話番号の形のものは伏せてある（tool の結果は公開データなのでそのまま）
  parts TEXT NOT NULL,
  -- 質問と一緒に送った、頁で見ていたもの・選んだ文（user の行だけ。無ければ空）
  context TEXT NOT NULL DEFAULT '',
  -- ここから下は assistant の行だけ。モデル ID、失敗の種類（model・mcp・aborted・invalid、成功は空）、token、段数、所要時間
  model TEXT,
  error TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  steps INTEGER,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, seq)
);
