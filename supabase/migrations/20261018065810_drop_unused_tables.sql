-- ============================================
-- 未使用テーブル reviews / user_preferences の削除
-- ============================================
-- 背景:
-- 初期スキーマ（20260202000000_initial_schema.sql）で作られたまま、機能として
-- 実装されなかった。src/ からの参照は自動生成の database.types.ts のみ。
--
-- #707（20261018053616）で anon / authenticated からの到達面は閉じたが、
-- テーブル自体が残っていると、
--   - reviews は USING (true) の公開SELECTポリシーを持ったままで、将来 GRANT を
--     戻すと anon から全行読める状態に復帰する
--   - 「使っていないのか、これから使うのか」が読み取れず、スキーマ変更のたびに
--     判断コストが発生する
-- という問題が残る。必要になった時点で作り直すほうが安全なので削除する。
--
-- 削除前の実測（2026-10-18）:
--   - reviews          : 0 行
--   - user_preferences : 0 行
--   - 他テーブルからの外部キー参照: なし
--   - 紐づくトリガー: 各テーブル自身の updated_at 更新トリガーのみ（CASCADE で消える）
--
-- 前例: #653 で未使用の otp_tokens / password_reset_tokens を削除している。

DROP TABLE IF EXISTS public.reviews;
DROP TABLE IF EXISTS public.user_preferences;
