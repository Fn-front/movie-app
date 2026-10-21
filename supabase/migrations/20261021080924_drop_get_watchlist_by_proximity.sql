-- 非推奨の get_watchlist_by_proximity を削除する（#803）
--
-- #800 で一覧取得を get_watchlist_sorted に一本化した際、マージ前のコードが
-- まだこの関数を呼んでいたため、互換用の委譲関数として 20261021071912 で
-- 置き直していた（DROP した瞬間に main と他ブランチの GET /api/watchlist が
-- 500 になったため）。#800 がマージされ役目を終えたので消す。
--
-- 削除時点の確認:
--   - main の src/ に参照なし
--   - 参照が残るリモートブランチはすべてオープンPRなし・未マージで、
--     最終コミットが2〜8ヶ月前の放置ブランチ

DROP FUNCTION IF EXISTS public.get_watchlist_by_proximity(UUID, INT, INT);
