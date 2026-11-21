-- ============================================
-- update_movie_cache_stats RPC の追加（日次更新の表示列を1本の UPDATE に集約）
-- ============================================
-- 背景（#433）: TMDb 利用規約 Section 1.C は「TMDb から取得した情報を6ヶ月を
-- 超えてキャッシュすること」を禁じている。日次 cron（updateMoviesCacheByBatch）は
-- 全行へ /movie/{id} を発行しているのに、レスポンスに含まれる genre_ids と
-- release_date を DB へ書いていなかったため、この2列だけが凍結していた。
--
-- 素の .update() に release_date を足せない理由:
--
--   現状の UPDATE は .eq('id', movieId) だけで theatrical / streaming の両行に
--   同じ値を当てている。ここに release_date を足すと、upsert_movie_cache が
--   DB 側で守っているリバイバル保護（20261017032342）を**毎日迂回する**。
--   かといって .eq('is_revival', false) を足すと、リバイバル行では
--   vote_average / title / poster_path の日次更新まで止まり、#433 が
--   解消しようとしている「6ヶ月未更新」をリバイバル行に新規作成してしまう。
--   しかも表示は正常なので気づけない。
--
--   列ごとの条件分岐は postgrest では表現できないため、upsert_movie_cache と
--   同じく DB 側へ置く。本番の movie_cache 1,263行のうち is_revival=true は
--   346行（27%）あり、TS 側で2文に分ける案は round trip がその分増える。
--   update-movies は maxDuration=300 で約1,231件を直列処理しているため、
--   round trip を増やさない形を選ぶ。
--
-- ⚠️ is_revival / cached_at / is_now_playing / release_type は更新しない。
--    それぞれ別の経路が持ち主で、ここから触ると持ち主の値を潰す。

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
    genre_ids = p_genre_ids,
    -- リバイバル行の公開日は映画.com側（syncEigaMovies の correctRevivalRow）が
    -- 持ち主。TMDbの原公開日で上書きしない。upsert_movie_cache と同じ規則。
    --
    -- ⚠️ 空文字を NULL に落とすのは必須。release_date は DATE 列で、
    --    TMDbは公開日未定の作品に '' を返す。''::DATE は
    --    `invalid input syntax for type date` になり、その映画の UPDATE が
    --    丸ごと失敗する（評価もポスターも永久に更新されなくなる）
    release_date = CASE
      WHEN movie_cache.is_revival THEN movie_cache.release_date
      WHEN p_release_date IS NULL OR p_release_date = '' THEN NULL
      ELSE p_release_date::DATE
    END,
    vote_average = p_vote_average,
    vote_count = p_vote_count,
    popularity = p_popularity,
    original_language = p_original_language,
    updated_at = now()
  WHERE id = p_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) IS
  '日次 cron が movie_cache の表示列・指標列をまとめて更新する。is_revival=true の行の release_date は上書きしない';

-- PostgreSQL は CREATE FUNCTION 時に PUBLIC へ EXECUTE を自動付与する。
-- 20261018042537 で既定権限を絞っているが、意図を読み取れるよう明示する。
REVOKE EXECUTE ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) TO service_role;
