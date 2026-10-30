-- ============================================
-- admin_audit_logs を追記専用にする
-- ============================================
-- 20261030100000 で `GRANT SELECT, INSERT` を書いたが、既定権限
-- （20261018053616 の ALTER DEFAULT PRIVILEGES）により service_role へ
-- UPDATE / DELETE / TRUNCATE も付与された状態になっていた（実測で確認）。
--
-- 監査ログは「後から書き換えられない」ことに価値がある。消せるなら、
-- 記録を残す意味が薄れる。アプリ側は INSERT と SELECT しか行わないため、
-- 余分な権限を剥奪しても機能に影響しない。
--
-- ⚠️ service_role キーを持つ攻撃者はテーブルごと DROP できるため、これは
--    完全な防御ではない。アプリのバグや誤操作で履歴が消える事故を防ぐ
--    多層防御として入れる。

REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM service_role;

-- anon / authenticated には元から何も付与していないが、既定権限の変更に
-- 備えて明示的に剥奪しておく
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;

COMMENT ON TABLE public.admin_audit_logs IS
  'admin によるアカウント発行・再発行の監査ログ。追記専用（service_role も UPDATE/DELETE 不可）。宛先メールアドレスは記録しない。';
