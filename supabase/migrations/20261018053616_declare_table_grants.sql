-- ============================================
-- テーブル権限を宣言で管理する（最小権限化）
-- ============================================
-- 背景:
-- .claude/rules/supabase-db.md は新規テーブルに明示的な GRANT を必須としているが、
-- それ以前に作られたテーブルは Supabase の既定権限に依存したままだった。
-- 実測したところ、17テーブルが anon / authenticated に
-- SELECT だけでなく **INSERT / UPDATE / DELETE / TRUNCATE まで**持っていた。
--
--   award_movies, dismissed_movies, favorites, movie_cache, now_showing_movies,
--   recommendation_events, recommendation_refreshes, recommendations, reviews,
--   saved_filters, theater_seats, theater_speakers, theaters, title_suggestions,
--   user_preferences, user_settings, watchlist
--
-- 現時点で悪用経路は無い。本アプリは NextAuth を使い Supabase Auth を使わないため
-- `auth.uid()` が常に NULL で、ユーザー固有テーブルの RLS ポリシーは anon に対して
-- 常に偽になる。書き込みポリシーを持たないテーブルも暗黙拒否される。
--
-- 問題は多層防御が RLS の1枚だけになっていること。ポリシーを1つ足しただけで
-- 到達面が変わるが、GRANT 側に意図が書かれていないため影響を読み切れない。
-- 加えて Supabase の仕様変更（既定GRANTの廃止）が効くと、宣言の無いテーブルは
-- service_role 経由も含めて一斉に 42501 になる。
--
-- ⚠️ 権限は REVOKE / GRANT 文を読むだけでは確認できない。適用前後に
-- information_schema.role_table_grants を実測すること。
-- 関数の EXECUTE で、PUBLIC だけ剥奪して anon が残る取りこぼしを一度やっている（#701）。

-- --------------------------------------------
-- 1. 今後作られるテーブルにも自動で適用する
-- --------------------------------------------
-- Supabase の既定は新規テーブルに anon / authenticated へ全権限を与える。
-- 規約（明示GRANT必須）に合わせ、既定そのものを閉じる。
-- 付け忘れたテーブルは Data API から 42501 になり、気づける。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- --------------------------------------------
-- 2. 公開読み取りが必要なテーブル
-- --------------------------------------------
-- anon キーで実際に読んでいるのはこの2つだけ（src/ の anon クライアント利用箇所を追跡）。
--   - award_movies       … src/app/api/awards/route.ts:159（受賞ページ）
--   - now_showing_movies … src/lib/api/nowShowing/nowShowing.server.ts:28（ホーム）
-- authenticated は本アプリで出番が無い（NextAuth 利用のため）ので付けない。

REVOKE ALL ON public.award_movies FROM anon, authenticated;
GRANT SELECT ON public.award_movies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.award_movies TO service_role;

REVOKE ALL ON public.now_showing_movies FROM anon, authenticated;
GRANT SELECT ON public.now_showing_movies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.now_showing_movies TO service_role;

-- --------------------------------------------
-- 3. service_role 専用のテーブル
-- --------------------------------------------
-- 下記はすべて API Route が service role クライアントで読み書きする。
-- 公開SELECTポリシーを持つもの（movie_cache / theaters / theater_seats /
-- theater_speakers / title_suggestions / reviews）も、anon キーで直接読む経路は
-- コード上に存在しないため到達面を閉じる。

REVOKE ALL ON public.movie_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_cache TO service_role;

REVOKE ALL ON public.theaters FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theaters TO service_role;

REVOKE ALL ON public.theater_seats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theater_seats TO service_role;

REVOKE ALL ON public.theater_speakers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.theater_speakers TO service_role;

REVOKE ALL ON public.title_suggestions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.title_suggestions TO service_role;

REVOKE ALL ON public.recommendations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendations TO service_role;

-- recommendation_events は 20261017130000 で authenticated へ明示付与していたが、
-- 本アプリは Supabase Auth を使わないため authenticated ロールに出番が無く、
-- 実質的に使われない権限だった。
REVOKE ALL ON public.recommendation_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_events TO service_role;

REVOKE ALL ON public.recommendation_refreshes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recommendation_refreshes TO service_role;

REVOKE ALL ON public.favorites FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO service_role;

REVOKE ALL ON public.watchlist FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO service_role;

REVOKE ALL ON public.dismissed_movies FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dismissed_movies TO service_role;

REVOKE ALL ON public.saved_filters FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_filters TO service_role;

REVOKE ALL ON public.user_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO service_role;

-- reviews / user_preferences はコードから一切参照されていない未使用テーブル。
-- 削除はデータを失う判断を伴うため本マイグレーションでは行わず、到達面だけ閉じる。
-- 削除の可否は別途判断する。
REVOKE ALL ON public.reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO service_role;

REVOKE ALL ON public.user_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO service_role;

-- --------------------------------------------
-- 4. 意図の記録
-- --------------------------------------------

COMMENT ON TABLE public.award_movies IS
  '受賞作品。受賞ページが anon キーで直接読むため anon に SELECT を付与している。';
COMMENT ON TABLE public.now_showing_movies IS
  '公開中の人気映画。ホームが anon キーで直接読むため anon に SELECT を付与している。';
COMMENT ON TABLE public.movie_cache IS
  '映画のキャッシュ。API Route が service_role で読み書きする。anon / authenticated への GRANT は 20261018053616 で剥奪済み。';
COMMENT ON TABLE public.reviews IS
  '未使用テーブル（コードから参照なし）。到達面を閉じてあるが、削除の可否は別途判断する。';
COMMENT ON TABLE public.user_preferences IS
  '未使用テーブル（コードから参照なし）。到達面を閉じてあるが、削除の可否は別途判断する。';
