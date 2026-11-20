-- アカウントの自己削除（#932）
--
-- 背景:
--   プライバシーポリシー（/privacy）は削除請求を受け付けると明記しているのに、
--   セルフサービスの手段が無く問い合わせを受けて手作業で消すしかなかった。
--   個人情報保護法35条（利用停止・消去請求）/ GDPR 17条（消去権）の窓口。
--
-- 方針は**即時の物理削除**。論理削除だとポリシーの「消去」と実態が食い違う。
--
-- ---------------------------------------------------------------------------
-- 1. 物理削除を阻む FK を外す
-- ---------------------------------------------------------------------------
-- `users(id)` を参照する FK は18本。16本は `ON DELETE CASCADE` だが、
-- **2本が `ON DELETE RESTRICT`** で、該当行があると `DELETE FROM users` が失敗する。
-- 管理操作を行ったアカウントが対象。
--
-- `SET NULL` へ変える。**誰が操作したかは失うが、操作があった事実は残る。**
-- CASCADE にすると監査ログの行ごと消え、監査証跡としての意味が薄れる。
--
-- ⚠️ そのため `NOT NULL` も外す必要がある。読み出し側は NULL を
--   「削除済みの利用者」として扱うこと。
--
-- ⚠️ `admin_audit_logs.target_user_id` は **CASCADE のまま据え置く**。
--   あちらは作成時から「アカウント削除時は記録も消える」と明示されており
--   （`20261030100000:45`）、削除を阻むこともない。意図的な既存の設計なので
--   本PRでは変えない。なお記録しているのは UUID と action と時刻だけで、
--   メールアドレスは持たない（同ファイル `:54` のコメント）。

ALTER TABLE public.admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_actor_user_id_fkey;

ALTER TABLE public.admin_audit_logs
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE public.admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.admin_audit_logs.actor_user_id IS
  '実行した admin。退会すると NULL になる（記録自体は残す / #932）';

ALTER TABLE public.award_sync_jobs
  DROP CONSTRAINT IF EXISTS award_sync_jobs_requested_by_fkey;

ALTER TABLE public.award_sync_jobs
  ALTER COLUMN requested_by DROP NOT NULL;

ALTER TABLE public.award_sync_jobs
  ADD CONSTRAINT award_sync_jobs_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.award_sync_jobs.requested_by IS
  '実行した admin。退会すると NULL になる（記録自体は残す / #932）';

-- ---------------------------------------------------------------------------
-- 2. 削除本体
-- ---------------------------------------------------------------------------
-- ⚠️ **`rate_limits` は CASCADE で消えない。** `user_id` を持たず identifier
--   文字列で引くため。用途ごとに3つの形がある。
--
--     利用者ID                … write_api_* / suggest_title など
--     メールアドレスそのもの    … otp_send_daily / password_reset_request
--     `メールアドレス|IP`       … ログイン系（`buildLoginIdentifier`。
--                                IP が unknown のときはアドレスのみ）
--
-- ⚠️ **`LIKE` を使わない。** メールアドレスには `_` や `%` が入りうる
--   （`a_b@example.com` は正当なアドレス）。`LIKE email || '|%'` だと
--   `_` が任意1文字として働き、**他人の行まで消す**。`starts_with()` は
--   パターン解釈をしないので安全。
--
-- ⚠️ **1つの関数にまとめるのはトランザクションのため。** 分けて呼ぶと、
--   `rate_limits` だけ消えて `users` の削除が失敗したときに
--   **まだ存在するアカウントの制限が解除された状態**で残る。

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_deleted_rate_limits INTEGER;
BEGIN
  -- 行ロックを取ってから進める。並行して同じ利用者を消そうとした場合に
  -- 片方が「対象なし」で抜けるのを防ぐ
  SELECT email INTO v_email
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user not found: %', p_user_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM rate_limits
  WHERE identifier = p_user_id::text
     OR identifier = v_email
     OR starts_with(identifier, v_email || '|');

  GET DIAGNOSTICS v_deleted_rate_limits = ROW_COUNT;

  -- 残り17テーブルは ON DELETE CASCADE で連鎖する
  DELETE FROM users WHERE id = p_user_id;

  RETURN v_deleted_rate_limits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_user_account(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID) TO service_role;

COMMENT ON FUNCTION public.delete_user_account(UUID) IS
  'アカウントを物理削除する。rate_limits は identifier 文字列で引くため CASCADE に乗らず、ここで明示的に消す。戻り値は消した rate_limits の件数（#932）';

-- ---------------------------------------------------------------------------
-- 3. chk_action_type に account_delete を追加する
-- ---------------------------------------------------------------------------
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。本ファイルの値は**直前の適用済み定義（20261120070906）を
-- そのまま引き継いで**1値だけ足している。

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      'registration',
      'login',
      'password_change',
      'write_api_favorites',
      'write_api_watchlist',
      'write_api_dismissed_movies',
      'write_api_profile',
      'write_api_settings',
      'read_api_theaters',
      'read_api_theater_detail',
      'awards_fetch',
      'suggest_title',
      'register',
      'change_password',
      'recommendation_refresh',
      'write_api_recommendation_events',
      'login_ip',
      'otp_send_daily',
      'otp_verify',
      'totp_verify',
      'password_reset_request',
      'password_reset_confirm',
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      'write_api_filters',
      'read_api_user_data',
      'read_api_person_detail',
      'admin_account_issue',
      'admin_award_sync',
      'admin_award_sync_status',
      'totp_settings_verify',
      'admin_role_check',
      'two_factor_send',
      'register_ip',
      'otp_verify_ip',
      'password_reset_request_ip',
      'otp_send_ip',
      'cron_failure_notice',
      'account_delete',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
