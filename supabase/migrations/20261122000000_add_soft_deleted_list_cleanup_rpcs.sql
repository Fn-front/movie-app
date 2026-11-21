-- ============================================
-- 論理削除された利用者リストの物理削除 RPC（#433 の作業4）
-- ============================================
-- 背景: favorites / watchlist / dismissed_movies は `deleted_at` が入っても
-- 行が残り続け、TMDb 由来の `title` / `poster_path` / `release_date` /
-- `genre_ids` をそのまま保持していた。TMDb 利用規約 Section 1.C の
-- 「6ヶ月を超えてキャッシュしない」に抵触する。
--
-- 本番実測（2026-11-21）で、既に `deleted_at` から6ヶ月を超えた行が21件あった。
--
--   favorites        162行中  2行が論理削除済み / うち 1行が6ヶ月超
--   watchlist        138行中 36行が論理削除済み / うち18行が6ヶ月超
--   dismissed_movies  10行中  3行が論理削除済み / うち 2行が6ヶ月超
--
-- 利用者とも結びついている（user_id）ので、#933 / #978 / #1300 / #1355 と同じ
-- 「不要となった個人データの消去」にも当たる。cleanup-expired-records へ寄せる。
--
-- 設計は delete_expired_recommendation_events（20261120083334）に揃える。
--
--   - `SECURITY INVOKER` + `SET search_path = public, pg_temp`
--   - `p_limit` で1回の削除件数を絞る（`statement_timeout = 8s` 対策）
--   - `ctid IN (...)` で選んだ行と消す行をずらさない
--
-- ⛔ **保持期間の下限ガードだけ既存の3つと違う。**
--
--   既存（rate_limits / otp_codes / password_reset_tokens）は `<= 0` を弾く
--   だけで、`retention_hours = 1` が通る。あちらは再発行できる認証の一時データ
--   なので実害が小さい。
--
--   こちらは**再発行できない利用者生成コンテンツ**。しかも
--   `e2e/helpers/api.ts` の `runDeleteExpired` は `retention_hours` を
--   引数でそのまま RPC へ流し、手元の `npm run test:e2e` は既定で**本番
--   Supabase を叩く**（`.claude/rules/testing.md`）。1回の呼び出しで全利用者の
--   お気に入りが消える経路を作らないために、下限を保持期間そのものに固定する。
--
--   ⚠️ 保持期間を 720時間 から変えるときは、この関数の下限も一緒に変えること。
--      `src/constants/cleanup.ts` の `SOFT_DELETED_LIST_RETENTION_HOURS` と
--      対になっている（ズレは `expiredRecords.test.ts` で検出する）。

-- ---------------------------------------------
-- favorites
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_favorites(
  retention_hours INTEGER,
  p_limit INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF retention_hours IS NULL OR retention_hours < 720 THEN
    RAISE EXCEPTION
      'retention_hours must be at least 720 for user content (got %)',
      retention_hours;
  END IF;

  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  DELETE FROM favorites
  WHERE ctid IN (
    SELECT ctid FROM favorites
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - make_interval(hours => retention_hours)
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_expired_favorites(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_favorites(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_favorites(INTEGER, INTEGER) IS
  'favorites の論理削除済み行を物理削除する。retention_hours は 720 以上のみ許可（#433）';

-- ---------------------------------------------
-- watchlist
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_watchlist(
  retention_hours INTEGER,
  p_limit INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF retention_hours IS NULL OR retention_hours < 720 THEN
    RAISE EXCEPTION
      'retention_hours must be at least 720 for user content (got %)',
      retention_hours;
  END IF;

  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  DELETE FROM watchlist
  WHERE ctid IN (
    SELECT ctid FROM watchlist
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - make_interval(hours => retention_hours)
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_expired_watchlist(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_watchlist(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_watchlist(INTEGER, INTEGER) IS
  'watchlist の論理削除済み行を物理削除する。retention_hours は 720 以上のみ許可（#433）';

-- ---------------------------------------------
-- dismissed_movies
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_dismissed_movies(
  retention_hours INTEGER,
  p_limit INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  IF retention_hours IS NULL OR retention_hours < 720 THEN
    RAISE EXCEPTION
      'retention_hours must be at least 720 for user content (got %)',
      retention_hours;
  END IF;

  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  DELETE FROM dismissed_movies
  WHERE ctid IN (
    SELECT ctid FROM dismissed_movies
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - make_interval(hours => retention_hours)
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_expired_dismissed_movies(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_dismissed_movies(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_dismissed_movies(INTEGER, INTEGER) IS
  'dismissed_movies の論理削除済み行を物理削除する。retention_hours は 720 以上のみ許可（#433）';
