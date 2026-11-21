-- ============================================
-- update_movie_cache_stats: original_language も空で潰さない
-- ============================================
-- 20261121170000 の追補（#433 / レビュー指摘）。あちらも適用済みのため
-- 編集しても本番へ届かない。CREATE OR REPLACE で差し替える。
--
-- 背景: 20261121170000 で release_date / genre_ids には「空なら既存値を残す」
-- 保護を入れたが、`original_language` だけ無条件上書きのまま残っていた。
--
-- この列は **NULL が「未取得」を意味し、除外対象にしない**という規約で使われて
-- いる（20261030155934 の COMMENT）。読み取り側の述語は
-- `original_language IS NULL OR original_language NOT IN (...)` の否定形なので、
-- 値が消えると**非表示のはずの地域の作品が一覧に出る**。
--
-- `upsert_movie_cache` は同じ理由で COALESCE を入れている
-- （20261030155934 の `original_language = COALESCE(EXCLUDED..., movie_cache...)`）。
-- 全行に毎日走るこちらにも同じ保護が要る。
--
-- あわせて `vote_count` にも COALESCE を入れる。NOT NULL 列なので、null を
-- 渡すと UPDATE が制約違反で落ちる。呼び出し側（buildStatsRpcArgs）は
-- `?? 0` で潰しているが、DB 側でも受け止めておく。

CREATE OR REPLACE FUNCTION public.update_movie_cache_stats(
  p_id INTEGER,
  p_title TEXT,
  p_overview TEXT,
  p_poster_path TEXT,
  p_backdrop_path TEXT,
  p_genre_ids JSONB,
  p_release_date TEXT,
  p_vote_average NUMERIC,
  p_vote_count INTEGER,
  p_popularity NUMERIC,
  p_original_language TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE movie_cache SET
    -- title は NOT NULL 制約がある。TMDbが空を返したときに上書きすると
    -- 行が壊れるため、そのときだけ既存値を残す
    title = COALESCE(NULLIF(p_title, ''), movie_cache.title),
    -- 空文字は「あらすじ無し」として保存経路と同じく null に寄せる
    overview = NULLIF(p_overview, ''),
    poster_path = p_poster_path,
    backdrop_path = p_backdrop_path,
    -- 空配列で潰さない（20261121170000 の理由）
    genre_ids = CASE
      WHEN p_genre_ids IS NULL THEN movie_cache.genre_ids
      WHEN jsonb_typeof(p_genre_ids) <> 'array' THEN movie_cache.genre_ids
      WHEN jsonb_array_length(p_genre_ids) = 0 THEN movie_cache.genre_ids
      ELSE p_genre_ids
    END,
    -- リバイバル行の公開日は映画.com側（syncEigaMovies の correctRevivalRow）が
    -- 持ち主。TMDbの原公開日で上書きしない。
    --
    -- ⚠️ 空文字を素通りさせないのは必須。release_date は DATE 列で、
    --    TMDbは公開日未定の作品に '' を返す。''::DATE は 22007 になり、
    --    その映画の UPDATE が丸ごと失敗する
    release_date = CASE
      WHEN movie_cache.is_revival THEN movie_cache.release_date
      WHEN p_release_date IS NULL OR p_release_date = ''
        THEN movie_cache.release_date
      ELSE p_release_date::DATE
    END,
    vote_average = p_vote_average,
    -- NOT NULL 列。null を渡されても制約違反で落とさない
    vote_count = COALESCE(p_vote_count, movie_cache.vote_count),
    popularity = p_popularity,
    -- ⚠️ NULL は「未取得＝除外対象にしない」を意味する。潰すと
    --    非表示のはずの地域の作品が一覧に出る（20261030155934 の COMMENT）
    original_language = COALESCE(
      NULLIF(p_original_language, ''),
      movie_cache.original_language
    ),
    updated_at = now()
  WHERE id = p_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$;

-- CREATE OR REPLACE は既存の権限を保持するが、意図を読み取れるよう明示する
REVOKE EXECUTE ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) TO service_role;
