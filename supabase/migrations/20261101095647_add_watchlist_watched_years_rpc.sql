-- 追加年ごとの視聴済み件数を返す
--
-- 視聴済み一括削除の年セレクトに出す選択肢を作る。
-- 集計（GROUP BY）は PostgREST で表現できないため RPC にする。
-- 対象一覧の取得と削除は単純な絞り込みなので PostgREST 直クエリで足りる。
--
-- 年を Asia/Tokyo で切る理由:
--   added_at は TIMESTAMPTZ で DB のタイムゾーンは UTC。素朴に
--   EXTRACT(YEAR FROM added_at) とすると、2025-01-01 05:00 JST に追加した行が
--   2024年扱いになり、画面に出ている日付とズレる。日本向けのアプリなので
--   JST 固定で切り、年の定義はバックエンドに一本化する。
--
--   直前のマイグレーション（fix_watchlist_timestamptz）で added_at を
--   TIMESTAMPTZ に揃えてある。TIMESTAMP のままだと AT TIME ZONE は
--   逆変換になるため、この関数は型移行が前提。
--
-- 戻り値の列名を count にしない理由:
--   COUNT(*) と紛らわしく、クエリを読み違える余地があるため watched_count にする。

CREATE OR REPLACE FUNCTION public.get_watchlist_watched_years(
  p_user_id UUID
)
RETURNS TABLE (
  added_year INT,
  watched_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXTRACT(YEAR FROM (w.added_at AT TIME ZONE 'Asia/Tokyo'))::INT AS added_year,
    COUNT(*) AS watched_count
  FROM watchlist w
  WHERE w.user_id = p_user_id
    AND w.deleted_at IS NULL
    AND w.watched_at IS NOT NULL
  GROUP BY 1
  ORDER BY 1 DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_watched_years(UUID) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_watched_years(UUID) IS
  '追加年（JST）ごとの視聴済み件数を降順で返す。0件の年は返さない。EXECUTE は service_role のみ。';
