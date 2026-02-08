-- ============================================
-- パスワード変更セキュリティ強化
-- ============================================

-- usersテーブルにpassword_changed_atカラムを追加
ALTER TABLE users
  ADD COLUMN password_changed_at TIMESTAMP;

-- rate_limitsテーブルのaction_typeチェック制約を更新
ALTER TABLE rate_limits
  DROP CONSTRAINT chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (action_type IN ('login', 'otp_verify', 'otp_resend', 'change_password'));
