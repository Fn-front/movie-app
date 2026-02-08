-- ============================================
-- usersテーブルにroleカラムを追加
-- ============================================

ALTER TABLE users
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';

-- roleカラムのバリデーション
ALTER TABLE users
  ADD CONSTRAINT chk_user_role CHECK (role IN ('user', 'admin'));

-- インデックス
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
