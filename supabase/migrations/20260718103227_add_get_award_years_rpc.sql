-- ============================================
-- get_award_years RPC 関数
-- ============================================
-- 受賞作品の「利用可能な年度」を DB 側で DISTINCT・降順ソートして返す。
-- 従来は全行の award_year を取得し JS 側（Set）で重複排除していたが、データ量
-- 増加に伴う転送量・メモリ増を避けるため DB 側で集約する。
-- 公開データ（anon が SELECT 可能な award_movies）を読むだけのため SECURITY INVOKER。

CREATE OR REPLACE FUNCTION public.get_award_years()
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT award_year ORDER BY award_year DESC),
    ARRAY[]::integer[]
  )
  FROM public.award_movies;
$$;

-- Data API（RPC / supabase-js）から呼び出せるよう EXECUTE を付与する。
-- awards の年度取得は anon クライアントで実行されるため anon にも付与する。
GRANT EXECUTE ON FUNCTION public.get_award_years() TO anon, authenticated, service_role;
