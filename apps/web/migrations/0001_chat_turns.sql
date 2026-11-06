-- 風土記の AI との会話を、改善のための分析に使う1往復ごとの記録（server/chat-log.ts が書く）。
-- 利用者を特定する情報（IP・UA・cookie）と AI の回答本文は持たない。90日を過ぎた行は書くたびに消す
CREATE TABLE chat_turns (
  id INTEGER PRIMARY KEY,
  -- 会話の無作為な ID（/api/sessions が発行する）と、その会話で何回目の質問か
  conversation_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  -- 会話を始めた頁の path（/・/assistant・/tokyo/nakano など）
  entry TEXT NOT NULL,
  -- 利用者の質問。メールアドレス・電話番号の形のものは伏せてある
  question TEXT NOT NULL,
  -- AI が呼んだ tool と引数（[{"name":…,"input":…}] の JSON）
  tool_calls TEXT NOT NULL,
  model TEXT NOT NULL,
  -- 失敗の種類（model・mcp・aborted・invalid）。成功は空
  error TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  steps INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  -- epoch ミリ秒
  created_at INTEGER NOT NULL
);
CREATE INDEX chat_turns_created_at ON chat_turns (created_at);
CREATE INDEX chat_turns_conversation ON chat_turns (conversation_id, turn);
