-- watchlist の added_at / deleted_at を TIMESTAMPTZ に揃える
--
-- 背景:
--   #160 で TIMESTAMP → TIMESTAMPTZ の統一を進めたとき、favorites /
--   saved_filters / dismissed_movies / users は移行したが watchlist が漏れていた。
--   watched_at だけは後から TIMESTAMPTZ で追加されており、同じテーブル内で
--   型が食い違った状態になっている。
--
-- 今ここで直す理由:
--   追加年（added_at）を JST で切る機能を足すため。TIMESTAMP のままだと
--   AT TIME ZONE 'Asia/Tokyo' が逆変換になり、PostgREST にオフセット付きの
--   境界値を渡してもオフセットが捨てられる。型を揃えないと、読んで正しそうに
--   見えるクエリが9時間ズレる。
--
--   get_watchlist_sorted は RETURNS TABLE (added_at TIMESTAMPTZ) と宣言しており、
--   実列が TIMESTAMP のため暗黙キャストが DB のタイムゾーン設定に依存していた。
--   この移行でその曖昧さも消える。
--
-- 既存値の解釈:
--   DEFAULT now() は DB のタイムゾーン（UTC）で書かれ、アプリも
--   new Date().toISOString()（UTC）で渡している。よって AT TIME ZONE 'UTC' で
--   解釈するのが正しい。

-- deleted_at を参照するポリシーをDROP
DROP POLICY IF EXISTS watchlist_select_own ON watchlist;

-- deleted_at を WHERE 句に持つ部分インデックスをDROP
DROP INDEX IF EXISTS idx_watchlist_user_movie;
DROP INDEX IF EXISTS idx_watchlist_user_watched;

-- 型変更
ALTER TABLE watchlist
  ALTER COLUMN added_at TYPE TIMESTAMPTZ USING added_at AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE TIMESTAMPTZ USING deleted_at AT TIME ZONE 'UTC';

-- ポリシーを再作成（定義は initial_schema と同一）
CREATE POLICY watchlist_select_own ON watchlist
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- 部分インデックスを再作成（定義は元と同一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_movie
  ON watchlist (user_id, tmdb_movie_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_watchlist_user_watched
  ON watchlist (user_id, watched_at)
  WHERE deleted_at IS NULL;
