-- TOTP テーブルから anon / authenticated のデフォルトGRANTを剥奪する
--
-- 直前の 20261017150000_add_totp_tables.sql は「service_role にだけ GRANT すれば
-- 他のロールからは到達しない」という前提で書いたが、これは**誤り**だった。
-- 本プロジェクトは既存プロジェクトであり、public スキーマのテーブルには
-- anon / authenticated へのデフォルトGRANTが付く。明示的に剥奪しない限り残る。
--
-- 適用後に実DBで確認した結果（anon キー / Data API 経由）:
--
--   anon select user_totp            ALLOWED (rows=0)   ← GRANT は通り、RLS が0行に絞っていた
--   anon insert user_totp            DENIED (42501)
--   anon update user_totp            ALLOWED (rows=0)
--   anon delete user_totp            ALLOWED (rows=0)
--
-- RLS にポリシーを1つも作っていないため実データは漏れていない（service_role で
-- 入れたカナリア行は anon から読めなかった）。しかし防御が RLS の一枚だけになり、
-- 将来ポリシーが1つ追加された時点で共有鍵が読める状態になる。
--
-- 20261017000000_drop_public_insert_policies.sql で users / otp_codes /
-- rate_limits / accounts に適用したのと同じ方針を、TOTP の2テーブルにも揃える。
-- 「RLS は GRANT がある前提で行を絞る仕組みであり、GRANT 自体を落とすほうが強い」。

REVOKE ALL ON public.user_totp FROM anon, authenticated;
REVOKE ALL ON public.totp_recovery_codes FROM anon, authenticated;

-- service_role は RLS をバイパスする管理ロール。アプリはこちらからのみ読み書きする。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_totp TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.totp_recovery_codes TO service_role;

COMMENT ON TABLE public.user_totp IS
  'TOTP（二段階認証）の共有鍵。service_role 専用。anon / authenticated への GRANT は 20261017160000 で剥奪済み。';
COMMENT ON TABLE public.totp_recovery_codes IS
  'TOTP のリカバリーコード。service_role 専用。anon / authenticated への GRANT は 20261017160000 で剥奪済み。';
