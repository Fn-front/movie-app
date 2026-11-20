-- ============================================
-- chk_action_type に未認証ルートの送信元単位カウンタを追加する
-- ============================================
-- 未認証で叩ける認証系ルートのレート制限が**識別子（メールアドレス）単位のみ**で、
-- 「識別子をいくつ作れるか」に天井が無かった。送信元IP単位のブレーキが手前に
-- 無いため、単一のIPからメールアドレスを変えるだけで `rate_limits` の行を
-- 無制限に増やせる。
--
--   POST /api/auth/password-reset/request  識別子 = email 単独       IP制限なし
--   POST /api/auth/register                識別子 = email|ip ＋ email IP制限なし
--   POST /api/auth/otp/verify              識別子 = email|ip         IP制限なし
--   NextAuth credentials（login）           識別子 = email|ip         LOGIN_IP あり ← これだけ守られていた
--
-- 行が膨らむと、保持期間の掃除（delete_expired_rate_limits）が
-- PostgREST 経由の `statement_timeout = 8s` を超えて全ロールバックし、
-- 1行も消えないまま翌日さらに増える詰み方をしうる（#1330）。
-- #933 が個人情報保護法22条を根拠に入れた48時間消去が恒久停止する。
--
-- ⛔ メール単位の識別子をIPに置き換える案は採らない。IPごとにカウンタが
--   分かれると同一メールボックスへの送信数をIP数だけ掛け算できる
--   （#641 / #644。`.claude/rules/api-route.md`「例外1」が明示的に禁じている）。
--   LOGIN_IP と同じく**手前に1枚重ねる**。
--
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。追加するときは必ず既存の全値を書き写すこと。

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）
      'registration',
      'login',
      'password_change',
      -- RATE_LIMIT_ACTION（src/constants/rateLimit.ts）
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
      -- 公開映画API（20261018052254 で追加）
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      -- 認証必須API（20261018052953 で追加）
      'write_api_filters',
      'read_api_user_data',
      -- 人物詳細API（20261020100000 で追加）
      'read_api_person_detail',
      -- 管理者発行アカウント（20261030120000 で追加）
      'admin_account_issue',
      -- 受賞作品の手動同期（20261031093154 で追加）
      'admin_award_sync',
      'admin_award_sync_status',
      -- 二段階認証の設定変更（20261106073857 で追加）
      'totp_settings_verify',
      -- admin ルートのロール確認（20261106095759 で追加）
      'admin_role_check',
      -- 第2要素コードのメール送信（20261118065143 で追加）
      'two_factor_send',
      -- 未認証の認証系ルートの送信元単位（本マイグレーションで追加）
      'register_ip',
      'otp_verify_ip',
      'password_reset_request_ip',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
