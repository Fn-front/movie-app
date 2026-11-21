-- 第2要素コードの送信プロンプトを送信元ごとに数える（GHSA-p899-6g7w-v7hg）
--
-- ⛔ **パスワードを知る第三者が、被害者のメールOTPログインを妨害できた。**
--
--   `authorize` はパスワード照合に成功して第2要素が未入力のとき、
--   `login`（5回/30分）の枠を解放してから第2要素コードを送る。解放は
--   正規の利用者が「コード入力 → 打ち間違え → 再送」で詰まらないように
--   #1283 で意図的に入れたもので、これ自体は必要だった。
--
--   ただし解放は攻撃者にも等しく効く。コードを入れずにパスワードだけを
--   61秒間隔で送ると、
--
--     - `login` は解放されるので積み上がらない
--     - 再送間隔（60秒）は `checkRateLimit` より前なので毎回素通りする
--     - `TWO_FACTOR_SEND`（10回/60分・**利用者単位**）だけが減る
--
--   11回（約11分）で上限に達し、被害者は60分ログインできない。以後は
--   毎時11リクエストで維持できる。残る制限は `LOGIN_IP`（20回/15分）だけで、
--   61秒間隔では抵触しない。
--
-- ⚠️ 認証の突破はできない（第2要素は分からない）。**可用性のみ**の侵害。
--
-- 対策は「送信元ごとの層を手前に重ねる」。`メール|IP` 単位で、上限は
-- `TWO_FACTOR_SEND` の**半分**（5回/60分）。1つの送信元では利用者の枠を
-- 使い切れず、別のIPから来る被害者には必ず残る。
--
-- ⚠️ `TWO_FACTOR_SEND` 側を置き換えるのではなく**足す**。あちらは
--   「同一利用者へ何通送るか」を抑えており、目的が違う。

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
      -- 第2要素コードの送信プロンプト（送信元ごと / GHSA-p899-6g7w-v7hg）
      'two_factor_send_prompt',
      'register_ip',
      'otp_verify_ip',
      'password_reset_request_ip',
      'otp_send_ip',
      'cron_failure_notice',
      'account_delete',
      'account_delete_code_send',
      'second_factor_setup_code_send',
      'email_change_request',
      'email_change_verify',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'RATE_LIMIT_ACTION（src/constants/rateLimit.ts）と必ず一致させること。足し忘れると consume_rate_limit の upsert が 23514 で落ち、そのルートのレート制限が丸ごと機能しなくなる。two_factor_send_prompt は送信元ごとの層で、利用者単位の two_factor_send とは別物（GHSA-p899-6g7w-v7hg）。';
