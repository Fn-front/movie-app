-- ============================================
-- 管理者ユーザーSeeder
-- ============================================
-- メール認証不要（is_verified = true）で role = 'admin' のユーザーを作成する。
--
-- 【重要】このファイルにパスワードハッシュを直接書かないこと。
-- 本リポジトリは公開されているため、ハッシュを書くと「生成元の平文が何であれ
-- 全世界に配布されたクレデンシャル」になる。psql 変数で実行時に注入する。
--
-- 使い方:
--   1. パスワードハッシュを生成する（履歴に残さないよう環境変数経由で渡す）
--        read -s ADMIN_PW
--        ADMIN_PW="$ADMIN_PW" node -e "const b=require('bcryptjs');b.hash(process.env.ADMIN_PW,12).then(h=>console.log(h))"
--   2. psql で変数を渡して実行する
--        psql "$DATABASE_URL" \
--          -v admin_email="admin@yourdomain.example" \
--          -v admin_name="管理者" \
--          -v admin_password_hash="<手順1の出力>" \
--          -f supabase/seeds/admin_user.sql
--
-- 注意:
--   - 既存ユーザーがいる場合は何もしない（ON CONFLICT DO NOTHING）。
--     既存アカウントを role = 'admin' へ自動昇格させる挙動は、意図しない
--     権限昇格につながるため持たせない。昇格が必要なら明示的に UPDATE すること。
--   - 設定したパスワードは初回ログイン後に変更すること。
-- ============================================

\if :{?admin_email}
\else
  \echo '[ERROR] -v admin_email=... が指定されていません'
  \quit 1
\endif

\if :{?admin_password_hash}
\else
  \echo '[ERROR] -v admin_password_hash=... が指定されていません'
  \quit 1
\endif

INSERT INTO users (email, password_hash, name, role, is_verified, created_at, updated_at)
VALUES (
  :'admin_email',
  :'admin_password_hash',
  :'admin_name',
  'admin',
  true,
  now(),
  now()
)
ON CONFLICT (email) DO NOTHING;
