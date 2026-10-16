-- ============================================
-- 公開INSERTポリシーの削除と最小権限化
-- ============================================
-- 背景:
-- 初期スキーマ（20260202000000_initial_schema.sql:230）が users に
-- `FOR INSERT WITH CHECK (true)` のポリシーを張ったまま残していた。
-- Supabase の既存プロジェクトは public スキーマのテーブルに anon / authenticated
-- へのデフォルトGRANTを持つため、このポリシーが残っていると anon キーで Data API
-- から任意の行を挿入できる（users なら is_verified / role を攻撃者が指定できる）。
--
-- アプリは新規登録を含む全ての書き込みを service_role（RLSバイパス）で行っており
-- （src/app/api/auth/register/route.ts）、anon / authenticated のテーブル権限は
-- 一切必要としない。ポリシーを削除したうえで、デフォルトGRANTも明示的に剥奪する。
--
-- 20260318000000_security_improvements.sql で rate_limits のポリシーは厳格化済み
-- だが、GRANT は剥奪されていなかったため本マイグレーションで併せて対応する。

-- --------------------------------------------
-- 1. 公開INSERTポリシーの削除
-- --------------------------------------------
-- ポリシーなし = 暗黙的に全拒否。service_role は RLS をバイパスするため影響なし。
--
-- 同種のポリシーを持っていた otp_tokens / password_reset_tokens は、テーブルごと
-- 20260312000000_phase8_auth_tables.sql:72,119 で削除済みのため対象外。
-- `DROP POLICY IF EXISTS ... ON <table>` の IF EXISTS はポリシーにしか掛からず、
-- テーブルが存在しないと 42P01 で落ちるため、ここに書いてはいけない。

DROP POLICY IF EXISTS users_insert_public ON public.users;

-- --------------------------------------------
-- 2. 認証・レート制限まわりのテーブルを service_role 専用にする
-- --------------------------------------------
-- RLS は「GRANT がある前提で行を絞る」仕組みであり、GRANT 自体を落とすほうが強い。
-- anon / authenticated からの到達性を断ち、PostgREST には 42501 を返させる。

REVOKE ALL ON public.users FROM anon, authenticated;
REVOKE ALL ON public.otp_codes FROM anon, authenticated;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
REVOKE ALL ON public.accounts FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.otp_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO service_role;

-- --------------------------------------------
-- 3. 意図の記録
-- --------------------------------------------

COMMENT ON TABLE public.users IS
  'ユーザー。service_role 経由でのみアクセスする（NextAuth が認証を担うため Data API 公開は不要）。anon / authenticated への GRANT は 20261017000000 で剥奪済み。';
COMMENT ON TABLE public.otp_codes IS
  'OTPコード。service_role 専用。anon / authenticated への GRANT は 20261017000000 で剥奪済み。';
COMMENT ON TABLE public.rate_limits IS
  'レート制限カウンタ。service_role 専用。anon / authenticated への GRANT は 20261017000000 で剥奪済み。';
