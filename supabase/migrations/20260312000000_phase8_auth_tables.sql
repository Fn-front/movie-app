-- ============================================
-- フェーズ8: 認証機能拡張 - DB・テーブル準備
-- ============================================
-- 1. accountsテーブル新規作成（ソーシャルログイン用）
-- 2. otp_tokensテーブルをotp_codesに変更（emailベース、action_type対応）
-- 3. usersテーブルのpassword_hashをNULL許容に変更
-- 4. password_reset_tokensテーブルをDROP（OTPで代替）

-- ============================================
-- 1. accountsテーブル作成（ソーシャルログインアカウント連携用）
-- ============================================

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'oauth',
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  token_type VARCHAR(50),
  scope VARCHAR(255),
  id_token TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- インデックス
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_provider_account
  ON accounts(provider, provider_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON accounts(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS有効化
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
-- SELECT: 自分のレコードのみ閲覧可能
CREATE POLICY accounts_select_own ON accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: サーバー側のみ（service role）
-- RLSではINSERTポリシーを設定しない（service roleでバイパス）

-- UPDATE: サーバー側のみ（service role）
-- RLSではUPDATEポリシーを設定しない（service roleでバイパス）

-- DELETE: 自分のレコードのみ削除可能
CREATE POLICY accounts_delete_own ON accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. otp_tokensテーブルをotp_codesに変更
-- ============================================

-- 旧テーブルのRLSポリシーを削除
DROP POLICY IF EXISTS otp_tokens_select_own ON otp_tokens;
DROP POLICY IF EXISTS otp_tokens_insert_public ON otp_tokens;
DROP POLICY IF EXISTS otp_tokens_update_own ON otp_tokens;
DROP POLICY IF EXISTS otp_tokens_delete_own ON otp_tokens;

-- 旧テーブルを削除
DROP TABLE IF EXISTS otp_tokens;

-- 新テーブル作成
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_otp_action_type CHECK (action_type IN ('registration', 'login', 'password_change')),
  CONSTRAINT chk_otp_attempts CHECK (attempts >= 0 AND attempts <= 5),
  CONSTRAINT chk_otp_code_format CHECK (code ~ '^\d{6}$')
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_action_created
  ON otp_codes(email, action_type, created_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at
  ON otp_codes(expires_at);

-- RLS有効化
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: OTPはすべてservice roleで操作するためポリシーは設定しない
-- （API Routeでservice_role keyを使用して操作）

-- ============================================
-- 3. usersテーブルのpassword_hashをNULL許容に変更
-- ============================================

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- ============================================
-- 4. password_reset_tokensテーブルをDROP（OTPで代替）
-- ============================================

-- RLSポリシーを削除
DROP POLICY IF EXISTS password_reset_tokens_select_own ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_insert_public ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_update_own ON password_reset_tokens;
DROP POLICY IF EXISTS password_reset_tokens_delete_own ON password_reset_tokens;

-- テーブルを削除
DROP TABLE IF EXISTS password_reset_tokens;
