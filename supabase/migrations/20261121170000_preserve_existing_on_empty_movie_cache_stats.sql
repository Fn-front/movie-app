-- ============================================
-- update_movie_cache_stats: TMDbが空を返したとき既存値を残す
-- ============================================
-- 20261121160000 の追補（#433）。あちらは適用済みのため編集しても本番へ
-- 届かない。CREATE OR REPLACE で差し替える。
--
-- 背景: 初版は release_date / genre_ids を無条件で上書きしていた。
-- この経路は**全行に毎日**走るため、TMDb が一時的に空を返しただけで
-- 既に入っていた値が消える。
--
--   - release_date が消えると `.gte('release_date', today)` で絞っている
--     公開予定の一覧から作品が落ちる
--   - genre_ids が [] に潰れるとジャンル絞り込みに出てこなくなる。
--     しかも `hasExcludedGenre([])` は false なので手前の除外判定も素通りし、
--     潰れたことに気づけない
--
-- どちらも「表示は壊れるがエラーは出ない」形なので、`title` に対して
-- 既に行っている保護（NOT NULL を壊さないために既存値を残す）と同じ扱いに揃える。
--
-- ⚠️ upsert_movie_cache（20261017032342）は EXCLUDED をそのまま入れるため
--    空で潰す。あちらは同期ウィンドウ内の作品しか通らず、TMDb から取り直した
--    直後の値であることが保証される。全行を毎日なぞるこちらとは条件が違う。
--
-- ⚠️ 代償として、TMDb が公開日やジャンルを**意図的に削除**した作品では
--    古い値が残り続ける。6ヶ月ルール（#433）の観点では「毎日取り直しては
--    いる」状態なので、消えないこと自体は許容する。

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
    -- 空配列で潰さない（上記の理由）
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
    --    TMDbは公開日未定の作品に '' を返す。''::DATE は 22007
    --    （invalid input syntax for type date）になり、その映画の UPDATE が
    --    丸ごと失敗する（評価もポスターも永久に更新されなくなる）
    release_date = CASE
      WHEN movie_cache.is_revival THEN movie_cache.release_date
      WHEN p_release_date IS NULL OR p_release_date = ''
        THEN movie_cache.release_date
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

-- CREATE OR REPLACE は既存の権限を保持するが、意図を読み取れるよう明示する
REVOKE EXECUTE ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_movie_cache_stats(
  INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, NUMERIC, INTEGER, NUMERIC, TEXT
) TO service_role;
