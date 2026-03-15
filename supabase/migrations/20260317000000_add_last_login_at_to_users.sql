-- usersテーブルに last_login_at カラムを追加
-- アクティブユーザー判定に使用（レコメンドCronで3日以内のログインユーザーのみ処理）
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL;
