-- users に初回レコメンド即時生成の使用記録を追加
--
-- 新規ユーザーはお気に入りを1件登録しても、日次CRON（UTC18:00 = JST3:00）が
-- 回るまで最大24時間「おすすめ映画を準備中です」のままだった。
-- お気に入り追加をきっかけに、その場で1度だけ生成をキックする。
--
-- 無料で何度も走らせられると OpenAI のコストが青天井になるため、
-- 「お気に入り追加 → 削除」を繰り返しても二度目が走らないよう、
-- 使用済みの時刻をユーザー単位で記録する（生涯1回）。

ALTER TABLE users
  ADD COLUMN instant_recommendation_used_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN users.instant_recommendation_used_at IS
  '初回お気に入り追加時の即時レコメンド生成を使用した時刻。生涯1回のみ無料で、2回目以降は発火しない';
