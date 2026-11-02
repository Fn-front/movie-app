-- ウォッチリストの並びで「配信中」とみなす範囲を切り替えられるようにする
--
-- p_streaming_scope:
--   'any'      : 見放題・レンタル・購入のいずれかで観られる（既定）
--   'flatrate' : 見放題になったときだけ
--
-- バッジの表示（streaming_offer_type / streaming_provider_ids）は
-- 範囲に関わらず実態を返す。この関数は範囲を並び順の判定にしか使わない。
--
-- ⚠️ 追記（#907）: 製品の挙動は後から変えた。'flatrate' のとき、
--    API 層（src/app/api/watchlist/route.ts）がレンタルのみの作品の
--    streaming を落とすため、カードに「レンタル」は出なくなった。
--    この関数の返り値自体は変えていないので、下の記述は関数の仕様としては
--    今も正しい。製品の見え方を知りたい場合は API 層を見ること。
--
-- 引数が増えるため CREATE OR REPLACE では置き換えられない。
-- DROP してから作り直すので、権限は明示的に書き直す。

DROP FUNCTION IF EXISTS public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN);

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
  'ウォッチリストを指定ソートで返す。視聴済みは常に最後。p_prioritize_streaming で配信中の未視聴を先頭に送り、p_streaming_scope でその対象範囲を切り替える。バッジ用の列は範囲に関わらず実態を返す。EXECUTE は service_role のみ。';
