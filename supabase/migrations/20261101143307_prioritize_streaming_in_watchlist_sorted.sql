-- ウォッチリストの並びで、配信中の未視聴作品を先頭に出せるようにする
--
-- 並び順:
--   ① 未視聴 × 配信中 × 初配信   ← since の新しい順
--   ② 未視聴 × 配信中 × 再配信   ← since の新しい順
--   ③ 未視聴 × 配信なし          ← 従来のソート
--   ④ 視聴済み                   ← 従来どおり最後
--
-- 再配信を②に下げる理由:
--   一度配信が終わった作品は「観る機会があったのに観なかった」ものであり、
--   初めて観られるようになった作品より優先度が低い。
--   副次的に、一時的な欠落を再配信と誤判定したときの害を吸収する
--   （誤判定しても最上位には来ず、先頭グループの末尾に回るだけで済む）。
--
-- p_prioritize_streaming を既定 FALSE にする理由:
--   この関数はサイドバーの「公開日が近い映画」でも使われている。
--   そこに配信中を先頭へ送る並びを持ち込むと見出しと中身が食い違うため、
--   ウォッチリストページの一覧取得だけが TRUE を渡す。
--
-- PR1 では「配信中」の判定を flatrate / paid のいずれかで固定する。
-- ユーザー設定による切り替えは PR2 で p_streaming_scope を足して行う。
--
-- 引数と戻り値が変わるため CREATE OR REPLACE では置き換えられない。
-- DROP してから作り直すので、権限は明示的に書き直す
-- （DROP → CREATE では既定付与が復活しうる）。

DROP FUNCTION IF EXISTS public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN);

CREATE FUNCTION public.get_watchlist_sorted(
  p_user_id UUID,
  p_sort TEXT,
  p_limit INT,
  p_offset INT DEFAULT 0,
  p_exclude_watched BOOLEAN DEFAULT FALSE,
  p_prioritize_streaming BOOLEAN DEFAULT FALSE
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
      -- 見放題とレンタルの両方で観られる場合は見放題を優先して見せる。
      -- 追加料金なしで観られる方が情報として強いため
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
      -- 並び順に使う「この配信期間がいつ始まったか」。
      -- 両方に値がある場合は新しい方を採る
      CASE
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          AND COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN GREATEST(s.flatrate_since, s.paid_since)
        WHEN COALESCE(jsonb_array_length(s.flatrate_provider_ids), 0) > 0
          THEN s.flatrate_since
        WHEN COALESCE(jsonb_array_length(s.paid_provider_ids), 0) > 0
          THEN s.paid_since
        ELSE NULL
      END AS streaming_since
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
    -- 配信中を先頭へ。初配信（0）→ 再配信（1）→ 配信なし（2）
    CASE
      WHEN NOT p_prioritize_streaming THEN 0
      WHEN e.watched_at IS NOT NULL THEN 0
      WHEN e.streaming_offer_type IS NULL THEN 2
      WHEN e.streaming_resumed THEN 1
      ELSE 0
    END,
    -- 配信中グループ内は検知が新しい順
    CASE
      WHEN p_prioritize_streaming AND e.watched_at IS NULL
        AND e.streaming_offer_type IS NOT NULL
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

REVOKE EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.get_watchlist_sorted(UUID, TEXT, INT, INT, BOOLEAN, BOOLEAN) IS
  'ウォッチリストを指定ソートで返す。視聴済みは常に最後。p_prioritize_streaming で配信中の未視聴を先頭に送る（サイドバーでは FALSE のまま使う）。EXECUTE は service_role のみ。';
