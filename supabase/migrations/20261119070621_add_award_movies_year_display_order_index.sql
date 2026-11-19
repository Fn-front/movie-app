-- award_movies: 公開APIが使う索引を足し、名前の食い違いと未使用の索引を片付ける（#1276）
--
-- 既存の索引は `(award_name, award_year)` の複合で、名前だけが
-- `idx_award_movies_award_year` だった。B-tree は先頭列の条件が無いと
-- 範囲走査に使えないため、`award_year` だけで絞る公開API
-- （`/api/awards`）と `get_award_years()` はこれを使えず全表走査していた。
--
-- 実測（2026-11-19。230行・3賞・3年度の時点）:
--
--   pg_stat_user_tables  seq_scan = 16,809 / seq_tup_read = 3,465,139
--   pg_stat_user_indexes idx_award_movies_award_year    6,166 scans（admin 側）
--                        uq_award_movies_entry            413 scans（UPSERT）
--                        award_movies_pkey                 10 scans
--                        idx_award_movies_is_winner         3 scans
--
-- 全表走査のほうが索引スキャンより多く、累計で346万行を読んでいる。
-- 1回あたりは 0.24ms（230行）で今は体感に出ないが、`award_movies` は
-- 賞×年度を同期するたびに積み上がる一方で、`WHERE award_year = ?` が返すのは
-- 1年度ぶん（約100行）のまま。総行数に比例して走査だけが重くなる形なので、
-- 行数が小さいうちに入れておく。

-- 1. 公開APIの絞り込みと並び替えを索引で解決する
--
-- `display_order` を含めるのは `/api/awards` の `ORDER BY display_order` まで
-- 賄うため。実測で Sort（quicksort 42kB）が消え 0.24ms → 0.06ms になった。
-- `get_award_years()` も Index Only Scan に載り 0.27ms → 0.10ms。
CREATE INDEX IF NOT EXISTS idx_award_movies_year_display_order
  ON public.award_movies (award_year, display_order);

COMMENT ON INDEX public.idx_award_movies_year_display_order IS
  '公開API /api/awards の WHERE award_year = ? ORDER BY display_order と、get_award_years() の DISTINCT award_year 用（#1276）';

-- 2. 既存の複合索引を実体に合わせて改名する
--
-- `idx_award_movies_award_year` という名前は「award_year の索引」と読めるが、
-- 実体は `(award_name, award_year)`。admin の
-- `/api/admin/awards/existing`（両方を `.eq()` で指定する）が 6,166 回
-- 使っているので**消さない**。名前だけ直す。
--
-- ALTER INDEX ... RENAME はカタログの更新だけで、行の書き換えが無い。
ALTER INDEX IF EXISTS public.idx_award_movies_award_year
  RENAME TO idx_award_movies_name_year;

COMMENT ON INDEX public.idx_award_movies_name_year IS
  'admin の /api/admin/awards/existing（award_name と award_year の両方で絞る）用。award_year 単独では使えない（#1276）';

-- 3. 使われていない索引を落とす
--
-- `is_winner` を WHERE / ORDER BY に使うクエリはアプリにもDB関数にも無い
-- （`src/` では SELECT の列としてしか現れず、`get_award_years()` も参照しない）。
-- 統計上も 3 scans しかない。boolean 単独は選択性が低く索引として働きにくいうえ、
-- 受賞同期の UPSERT で書き込みコストだけ乗る。
--
-- ⚠️ 復活させるときは、`is_winner` を**単独で**絞るクエリが本当にあるかを
-- 先に確認すること。実際には `award_year` との複合でしか意味を持たない。
DROP INDEX IF EXISTS public.idx_award_movies_is_winner;
