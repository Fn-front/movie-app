-- movie_streaming_status に残った authenticated への GRANT を剥がす（#1381）
--
-- 剥奪マイグレーション（20261018053616_declare_table_grants.sql）の **後** に
-- 作られたテーブル（20261101142314）で、既定権限の剥奪が効く範囲外の
-- 明示的な GRANT を書いていた。以降どのマイグレーションでも REVOKE していない。
--
-- 実害は出ていない。このアプリの認証は NextAuth で、Supabase の JWT を
-- 発行する経路が1つも無いため、`authenticated` ロールに切り替わる
-- リクエストが存在しない（到達不能な権限）。
--
-- 残すと問題なのは次の2点。
--   1. 将来 Supabase Auth を併用したり anon キーに JWT を載せる経路ができた
--      瞬間に到達可能になる。そのとき誰も気づかない
--   2. 「authenticated には付与しない」という方針の唯一の例外で、棚卸しの
--      たびに判断が止まる（skills の記述が実際にこれを見落としていた / #1209）
--
-- 適用前の実測（本番）:
--   authenticated → SELECT
--   service_role  → DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   postgres      → 同上
--   anon          → 無し
--
-- ⚠️ service_role の GRANT は残す。サーバー側（日次 Cron の同期処理 /
--    src/lib/sync/syncWatchlistStreaming.ts）が読み書きする。

-- ポリシーも一緒に落とす。GRANT が無ければ到達しないが、残っていると
-- 「authenticated 経路が想定されている」と読めてしまう
DROP POLICY IF EXISTS movie_streaming_status_select_authenticated
  ON public.movie_streaming_status;

REVOKE ALL ON public.movie_streaming_status FROM anon, authenticated;
