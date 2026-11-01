-- ============================================
-- award_sync_jobs の service_role 権限を絞る
-- ============================================
-- 20261031093105 で `GRANT SELECT, INSERT, UPDATE` を書いたが、既定権限
-- （20261018053616 の ALTER DEFAULT PRIVILEGES）により service_role へ
-- DELETE / TRUNCATE も付与された状態になっていた（実測で確認。
-- `node scripts/show-table-grants.mjs` が DIRSTTU と表示する）。
--
-- admin_audit_logs でも同じことが起き、20261030101000 で剥奪している。
-- 明示的な GRANT は既定付与を上書きしない。**絞りたいなら REVOKE が要る。**
--
-- ジョブ履歴は「いつ誰が何を流して、どう終わったか」の記録として残す。
-- アプリ側は SELECT / INSERT / UPDATE しか行わないため、DELETE と TRUNCATE を
-- 剥奪しても機能に影響しない。誤操作やバグで履歴が消える事故を防ぐ。
--
-- ⚠️ service_role キーを持つ攻撃者はテーブルごと DROP できるため、これは
--    完全な防御ではない。多層防御として入れる。

REVOKE DELETE, TRUNCATE ON public.award_sync_jobs FROM service_role;

-- anon / authenticated には元から付与していないが、既定権限の変更に備えて
-- 明示的に剥奪しておく
REVOKE ALL ON public.award_sync_jobs FROM anon, authenticated;

COMMENT ON TABLE public.award_sync_jobs IS
  '受賞作品の手動同期ジョブ。pending は持たず running から始まる。履歴は削除しない（service_role も DELETE 不可）。';
