-- ============================================
-- 管理者ユーザーSeeder
-- ============================================
-- メール認証不要（is_verified = true）
-- role = 'admin' で挿入
--
-- 使い方:
--   1. 下記のメールアドレスとパスワードハッシュを環境に合わせて変更
--   2. Supabase SQL Editorで実行
--
-- パスワードハッシュの生成方法:
--   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('your-password', 12).then(h => console.log(h));"
-- ============================================

INSERT INTO users (email, password_hash, name, role, is_verified, created_at, updated_at)
VALUES (
  'admin@example.com',
  -- デフォルトパスワード: 'Admin1234'（必ず変更してください）
  '$2b$12$/U3RRTxAaDW.vYoGK3EMO.rl2cLr.3d314RKTVSPZGQ/f4jgy.y3u',
  '管理者',
  'admin',
  true,
  now(),
  now()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  is_verified = true,
  updated_at = now();
