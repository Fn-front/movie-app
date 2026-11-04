-- ============================================
-- award_sync_jobs に warning_message 列を追加
-- ============================================
--
-- 「成功したが気に留めてほしいこと」を載せる。現状の用途は、旧世代の DELETE に
-- 失敗して残留行が残ったケース（#953）。UPSERT は成功しておりデータは新しいので
-- status は succeeded のままにする。
--
-- error_message を流用しない。あちらは失敗時のみ使う列で、succeeded と同時に
-- 埋まると「成功なのかエラーなのか」が読み取れなくなる。
--
-- 既存の GRANT（20261031093518_restrict_award_sync_jobs_grants.sql）は
-- テーブル単位なので、列を足しても付け直す必要は無い。

ALTER TABLE public.award_sync_jobs
  ADD COLUMN IF NOT EXISTS warning_message TEXT;

COMMENT ON COLUMN public.award_sync_jobs.warning_message IS
  '成功時の警告。旧世代の削除に失敗して残留行が残った場合など。失敗理由は error_message に入れる。';
