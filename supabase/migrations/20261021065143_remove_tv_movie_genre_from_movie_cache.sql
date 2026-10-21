-- 除外ジャンル（テレビ映画）に該当する行を movie_cache から削除する
--
-- 背景:
--   テレビ映画(10770) は EXCLUDED_GENRE_IDS に含まれ、保存前フィルタ
--   （excludeInappropriateMovies）で弾いているはずだが、5行が残っていた。
--   TMDb は公開後にジャンルを追加することがあり、保存時点では該当しなかった
--   作品が後から除外対象になる。保存前フィルタは保存の瞬間しか効かない。
--
--   今後は updateMoviesCacheByBatch（毎日のCRON）が映画詳細を取得する際に
--   除外ジャンルを再判定して削除するため、同じ状態は自動で解消される。
--   本マイグレーションは、それを待たずに現状を揃えるためのもの。

DELETE FROM public.movie_cache
WHERE genre_ids @> '[10770]'::jsonb;
