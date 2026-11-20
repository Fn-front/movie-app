-- recommendation_events の掃除を cleanup-expired-records へ寄せる（#1355）
--
-- 背景:
--   `delete_expired_recommendation_events` はレコメンド生成CRONに相乗りしており、
--   呼び出し側が RPC の失敗を catch して 0 を返していた。CRON は 200 /
--   `success: true` で終わるため、**保持期間を超えた行動ログが消えていないことに
--   誰も気づけなかった**。個人情報保護法22条に関わる処理で、#933 / #978 / #1300 と
--   同じ分類。
--
--   専用CRON（`/api/cron/cleanup-expired-records`）は対象ごとに catch して
--   `hasError` を立て、500 + 通知まで通す。そちらへ移す。
--
-- 変更:
--   引数を `retention_days INTEGER` から `retention_hours INTEGER, p_limit INTEGER`
--   へ揃える。`CLEANUP_TARGETS` の RPC は `runBatchedDelete` から
--   `{ retention_hours, p_limit }` で呼ばれるため、他の3つと同じ形にする必要がある。
--
-- ⚠️ **旧シグネチャを DROP する。** 残すとオーバーロードになり、
--   「どちらが呼ばれているか」をコードから読み取れなくなる。唯一の呼び出し元
--   （`generateRecommendationsService.ts`）は同じPRで削除している。
--
--   デプロイ前にこのマイグレーションだけが本番へ入る時間帯は、旧シグネチャを
--   呼ぶ現行コードが失敗する。ただし**失敗しても 0 を返して続行する**実装なので
--   レコメンド生成は止まらず、影響は「その日の掃除が1回飛ぶ」だけ。
--   保持期間は90日あるため許容する。
--
-- ⚠️ `DROP FUNCTION` → `CREATE` では PUBLIC / anon / authenticated への既定付与が
--   復活しうる（`.claude/rules/supabase-db.md`）。REVOKE / GRANT を書き直す。
--
-- 設計は `delete_expired_otp_codes`（20261120062604）に揃える。
--
--   - `SECURITY INVOKER` + `SET search_path = public, pg_temp`
--   - 保持期間の下限ガード（`<= 0` / NULL を弾く）
--   - `p_limit` で1回の削除件数を絞れる（`statement_timeout = 8s` 対策）
--   - `LIMIT p_limit` は NULL なら上限なしとして働くので分岐を書かない
--
-- ⚠️ `ctid IN (...)` も揃えるが、**理由は otp_codes とは違う**。
--   あちらは検証のたびに `attempts` が UPDATE されるが、`recommendation_events`
--   は `ON CONFLICT DO NOTHING` の INSERT しかなく UPDATE は1行も発行しない
--   （`src/app/api/recommendations/events/route.ts`）。
--
--   それでも `ctid` を使うのは、利用者削除の `ON DELETE CASCADE` による
--   同時 DELETE がありうるのと、`runBatchedDelete` が外側の WHERE に期限条件を
--   再掲しない前提で `deleted < BATCH_SIZE` を打ち切り条件にしているため、
--   選んだ行と消す行がずれる余地を残したくないから。

DROP FUNCTION IF EXISTS public.delete_expired_recommendation_events(INTEGER);

CREATE OR REPLACE FUNCTION public.delete_expired_recommendation_events(
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
  -- `make_interval(hours => -5)` は `-05:00:00` を返すため `now() - (-5時間)` が
  -- 未来になり、**保持期間内の行まで消える**。0 も同様
  IF retention_hours IS NULL OR retention_hours <= 0 THEN
    RAISE EXCEPTION
      'retention_hours must be a positive integer (got %)', retention_hours;
  END IF;

  -- 0 や負数だと「1件も消さないのに成功」を返し、呼び出し側のループが
  -- 即座に打ち切られる。黙って何も消さないより落とす
  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  DELETE FROM recommendation_events
  WHERE ctid IN (
    SELECT ctid FROM recommendation_events
    WHERE created_at < now() - make_interval(hours => retention_hours)
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_expired_recommendation_events(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_recommendation_events(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_recommendation_events(INTEGER, INTEGER) IS
  'recommendation_events の保持期間切れ行を削除する。p_limit を渡すと1回の削除件数を制限する（省略時は上限なし）。cleanup-expired-records CRON から呼ぶ（#1355）';
