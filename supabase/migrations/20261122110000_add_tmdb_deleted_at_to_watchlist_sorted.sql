-- get_watchlist_sorted に tmdb_deleted_at を足す（#433 の作業3）
--
-- 案D（TMDbから消えた作品は残して画面で知らせ、猶予後に自動削除）の
-- バッジを一覧に出すため、行ごとの検知時刻を返す必要がある。
--
-- ⚠️ **RETURNS TABLE が変わるので CREATE OR REPLACE では置き換えられない。**
--    DROP してから作り直すため、権限を明示的に書き直す
--    （.claude/rules/supabase-db.md: DROP → CREATE では既定付与が復活しうる）。
--
-- 本体は 20261102050659 から変えていない。差分は次の3箇所だけ:
--   1. RETURNS TABLE に tmdb_deleted_at TIMESTAMPTZ
--   2. enriched CTE の SELECT に w.tmdb_deleted_at
--   3. 外側の SELECT に e.tmdb_deleted_at
--
-- ⚠️ WHERE に tmdb_deleted_at の条件を足していない。案D は
--    **消さずに残して知らせる**方針なので、一覧から外すと目的を果たさない。

DROP FUNCTION IF EXISTS public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT);

CREATE FUNCTION public.get_watchlist_sorted(
  p_user_id UUID,
  p_sort TEXT,
  p_limit INT,
  p_offset INT DEFAULT 0,
  p_exclude_watched BOOLEAN DEFAULT FALSE,
  p_prioritize_streaming BOOLEAN DEFAULT FALSE,
  p_streaming_scope TEXT DEFAULT 'any'
)
RETURNS TABLE (
  id UUID,
  tmdb_movie_id INT,
  title TEXT,
  poster_path TEXT,
  release_date DATE,
  added_at TIMESTAMPTZ,
  watched_at TIMESTAMPTZ,
  streaming_offer_type TEXT,
  streaming_provider_ids JSONB,
  streaming_resumed BOOLEAN,
  tmdb_deleted_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH enriched AS (
    SELECT
      w.id,
      w.tmdb_movie_id,
      w.title,
      w.poster_path,
      w.release_date,
      w.added_at,
      w.watched_at,
      w.tmdb_deleted_at,
      -- バッジは実態をそのまま返す（範囲設定で隠さない）。
      -- 見放題とレンタルの両方で観られる場合は見放題を優先して見せる
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN 'flatrate'
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN 'paid'
        ELSE NULL
      END AS streaming_offer_type,
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN s.flatrate_provider_ids
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN s.paid_provider_ids
        ELSE '[]'::jsonb
      END AS streaming_provider_ids,
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN COALESCE(s.flatrate_resumed, FALSE)
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN COALESCE(s.paid_resumed, FALSE)
        ELSE FALSE
      END AS streaming_resumed,
      -- 並び順の判定だけが範囲設定の影響を受ける
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN TRUE
        WHEN p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN TRUE
        ELSE FALSE
      END AS counts_as_streaming,
      -- 並び順に使う「この配信期間がいつ始まったか」。
      -- 範囲に含まれる形態のものだけを見る
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          AND p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN GREATEST(s.flatrate_since, s.paid_since)
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN s.flatrate_since
        WHEN p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN s.paid_since
        ELSE NULL
      END AS streaming_since,
      -- 再配信の判定も範囲に含まれる形態のものを見る
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN COALESCE(s.flatrate_resumed, FALSE)
        WHEN p_streaming_scope = 'any'
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN COALESCE(s.paid_resumed, FALSE)
        ELSE FALSE
      END AS order_resumed
    FROM watchlist w
    LEFT JOIN movie_streaming_status s
      ON s.tmdb_movie_id = w.tmdb_movie_id
    WHERE w.user_id = p_user_id
      AND w.deleted_at IS NULL
      AND (NOT p_exclude_watched OR w.watched_at IS NULL)
  )
  SELECT
    e.id,
    e.tmdb_movie_id,
    e.title,
    e.poster_path,
    e.release_date,
    e.added_at,
    e.watched_at,
    e.streaming_offer_type,
    e.streaming_provider_ids,
    e.streaming_resumed,
    e.tmdb_deleted_at,
    COUNT(*) OVER() AS total_count
  FROM enriched e
  ORDER BY
    -- 視聴済みは常に最後
    CASE WHEN e.watched_at IS NULL THEN 0 ELSE 1 END,
    -- 配信中を先頭へ。初配信（0）→ 再配信（1）→ 対象外（2）
    CASE
      WHEN NOT p_prioritize_streaming THEN 0
      WHEN e.watched_at IS NOT NULL THEN 0
      WHEN NOT e.counts_as_streaming THEN 2
      WHEN e.order_resumed THEN 1
      ELSE 0
    END,
    -- 配信中グループ内は検知が新しい順
    CASE
      WHEN p_prioritize_streaming AND e.watched_at IS NULL
        AND e.counts_as_streaming
        THEN e.streaming_since
      ELSE NULL
    END DESC NULLS LAST,
    -- 公開日が近い順。公開日なしは同グループ内の末尾
    CASE
      WHEN p_sort <> 'release_date_proximity' THEN NULL
      WHEN e.release_date IS NULL THEN 1
      ELSE 0
    END NULLS FIRST,
    CASE
      WHEN p_sort = 'release_date_proximity' THEN ABS(e.release_date - CURRENT_DATE)
      ELSE NULL
    END NULLS FIRST,
    e.added_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
REVOKE EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN, TEXT) IS
  'ウォッチリストを並び替えて返す。p_prioritize_streaming=true で配信中を先頭へ、p_streaming_scope は配信中とみなす範囲（any=見放題/レンタル/購入、flatrate=見放題のみ）。バッジの表示は範囲に関わらず実態を返し、範囲は並び順の判定にのみ使う。tmdb_deleted_at は TMDb で404になった作品の検知時刻（#433）。EXECUTE は service_role のみ';
