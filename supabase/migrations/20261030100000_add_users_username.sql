-- ============================================
-- 管理者発行アカウント: users.username を追加する
-- ============================================
-- メールアドレスを保存しないアカウントを admin が発行できるようにする。
-- 設計: .claude/documents/admin-account-design.md
--
-- email は NOT NULL / UNIQUE のまま据え置く。NULL 許容にすると既存のメール系
-- クエリ（authorize / OAuth リンク / otp_codes 突合）をすべて NULL 安全か
-- 確認する必要があるため、発行アカウントには合成値
-- `<ランダム>@<ランダム>.invalid` を入れる。
--
-- `.invalid` は RFC 2606 の予約TLDで絶対に名前解決されない。実在ドメインを
-- 使うと、何かの拍子に赤の他人へ配送される事故が起きる。
--
-- ⚠️ 合成アドレスは**内部識別子のみ**。本人には教えず、復旧にも使わない。
--    教えた時点で「平文保存された復旧の鍵」になる。

-- ユーザー名。既存ユーザーは持たないため NULL 許容。
-- 大小文字を区別しない一意性を保証する（email と同じ方針）。
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username VARCHAR(32);

COMMENT ON COLUMN public.users.username IS
  'admin が発行したアカウントのログイン識別子。サーバー側でランダム生成する。メールログインのユーザーは NULL。';

-- 大小文字を無視した一意制約。利用者が打ち間違えた大小文字でも同一視するため、
-- 照合側も lower() を通す前提にする。
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

-- ============================================
-- admin 操作の監査ログ
-- ============================================
-- admin による発行・再発行はシステム内で最も強い操作であり、記録が無いと
-- admin セッションを奪った攻撃者が静かに任意のアカウントを乗っ取れて
-- 痕跡も残らない。
--
-- ⚠️ 宛先メールアドレスは記録しない（保存しない方針を維持する）。
--    「誰がいつどのアカウントに対して何をしたか」だけを残す。
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 実行した admin。admin が削除されても記録は残す
  actor_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  -- 対象アカウント。アカウント削除時は記録も消える
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_admin_audit_action
    CHECK (action IN ('account_create', 'account_reissue'))
);

COMMENT ON TABLE public.admin_audit_logs IS
  'admin によるアカウント発行・再発行の監査ログ。宛先メールアドレスは記録しない。';

-- 「このアカウントに何が行われたか」を引くための索引
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
  ON public.admin_audit_logs (target_user_id, created_at DESC);

-- 「この admin が何をしたか」を引くための索引
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor
  ON public.admin_audit_logs (actor_user_id, created_at DESC);

-- Data API への公開に必要な GRANT。
-- サーバー側（API Route）からのみ触るため service_role だけに付ける。
-- anon / authenticated には付与しない（監査ログを利用者に見せる必要がない）。
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;
