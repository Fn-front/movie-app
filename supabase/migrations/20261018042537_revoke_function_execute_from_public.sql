-- ============================================
-- 関数の EXECUTE を PUBLIC から剥奪し、search_path を固定する
-- ============================================
-- 背景:
-- PostgreSQL は CREATE FUNCTION 時に EXECUTE を PUBLIC へ自動付与する。
-- 本リポジトリの RPC はいずれも REVOKE しておらず、公開されている anon キーから
-- POST /rest/v1/rpc/<関数名> で呼び出し自体は到達できた。
--
-- 現時点で悪用可能な経路は無い（全関数が SECURITY INVOKER で、対象テーブルの
-- RLS と GRANT が呼び出しロールの権限で弾く）。ただし多層防御が1枚しかない状態で、
-- 関数定義のミス1つで即座に実害へ変わる。実際に一度起きている:
--
--   sync_trending_movies (20260314100000:13) と sync_now_showing_movies
--   (20260314500000:34) は SECURITY DEFINER で作られ、同時に
--   20260314100000:8 が NO FORCE ROW LEVEL SECURITY を設定していた。
--   20260318000000 で INVOKER へ是正されるまでの 2026-03-14 〜 03-16 の約1.8日間
--   （40e5029 〜 ab2ae1c）、「DEFINER ＋ PUBLIC EXECUTE」が同時成立しており、
--   公開 anon キーだけで now_showing_movies を全件削除・差し替えできた。
--
-- 併せて、他の関数が設定済みの SET search_path が2関数だけ漏れているため揃える。
-- search_path が可変のまま SECURITY DEFINER に戻ると、呼び出し元が関数内で
-- 参照される関数・テーブルを自前スキーマの同名物へすり替えられる
-- （Supabase lint: function_search_path_mutable）。

-- --------------------------------------------
-- 1. 今後作られる関数にも自動で適用する
-- --------------------------------------------
-- CREATE OR REPLACE は既存権限を保持するが、DROP → CREATE では PUBLIC EXECUTE が
-- 静かに復活する（20260314500000:29 が実際に DROP FUNCTION を使っている）。
-- 個別 REVOKE だけだと人間の記憶に依存するため、既定権限そのものを絞る。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- --------------------------------------------
-- 2. SET search_path が漏れている2関数を揃える
-- --------------------------------------------
-- CREATE OR REPLACE は同一OIDを維持するため、トリガーの紐づけも既存の権限も保持される。
-- 属性を省略すると既定値に戻るため、LANGUAGE / STABLE / SECURITY は明示し直す。

-- 全テーブルではなく11テーブルの BEFORE UPDATE トリガーが参照している
-- （users / movie_cache / rate_limits / user_preferences / reviews / saved_filters /
--   user_settings / favorites / accounts / dismissed_movies / theaters）。
-- RETURNS TRIGGER のため PostgREST のスキーマキャッシュから除外され RPC として
-- 公開されない。よって下の REVOKE 対象からは外し、search_path のみ固定する。
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_watchlist_by_proximity(
  p_user_id UUID,
  p_limit INT,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  tmdb_movie_id INT,
  title TEXT,
  poster_path TEXT,
  release_date DATE,
  added_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    w.id,
    w.tmdb_movie_id,
    w.title,
    w.poster_path,
    w.release_date,
    w.added_at,
    COUNT(*) OVER() AS total_count
  FROM watchlist w
  WHERE w.user_id = p_user_id
    AND w.deleted_at IS NULL
  ORDER BY
    CASE WHEN w.release_date IS NULL THEN 1 ELSE 0 END,
    ABS(w.release_date - CURRENT_DATE),
    w.added_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- --------------------------------------------
-- 3. EXECUTE を PUBLIC から剥奪し、必要なロールにだけ付与する
-- --------------------------------------------
-- ⚠️ service_role は superuser ではないため、PUBLIC を剥奪したら明示的な
-- GRANT が必須。付け忘れるとサーバー側の全呼び出しが 42501 で落ちる。
--
-- 呼び出し元の実測（src/ 全体の .rpc( を追跡）:
--   - get_award_years          … createAnonClient()（src/app/api/awards/route.ts:151）
--   - それ以外の6関数          … すべて service_role 経由
--     （createServiceRoleClient() / withAuth / 各 sync 処理 / auth.ts）
-- ブラウザ用 supabase クライアントから .rpc() を呼ぶコードは存在しない。

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_recommendations(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_recommendations(UUID, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_movie_cache(JSONB, BOOLEAN) TO service_role;

REVOKE EXECUTE ON FUNCTION public.sync_now_showing_movies(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_now_showing_movies(JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_by_proximity(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_watchlist_by_proximity(UUID, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_expired_recommendation_events(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expired_recommendation_events(INTEGER) TO service_role;

-- get_award_years は 20260718103227:25 で anon / authenticated / service_role へ
-- GRANT 済みだが、PUBLIC が残っていたためその GRANT は実質的に no-op だった。
-- PUBLIC を剥奪して初めて「anon にだけ公開する」という意図が権限に反映される。
REVOKE EXECUTE ON FUNCTION public.get_award_years() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_award_years() TO anon, authenticated, service_role;

-- --------------------------------------------
-- 4. 意図の記録
-- --------------------------------------------

COMMENT ON FUNCTION public.get_watchlist_by_proximity(UUID, INT, INT) IS
  'ウォッチリストを公開日の近い順に返す。SECURITY INVOKER のため RLS が効く。EXECUTE は service_role のみ（PUBLIC は 20261018042537 で剥奪）。';
COMMENT ON FUNCTION public.update_updated_at_column() IS
  'BEFORE UPDATE トリガーで updated_at を現在時刻に更新する。search_path 固定済み。';
