-- password_reset_tokens.used_at のコメントを実態に合わせる（#1300）
--
-- 20261120062604 で `delete_expired_password_reset_tokens` を足し、
-- **期限切れなら使用済みかどうかに関わらず消す**ようになった。
-- 既存のコメントは「行は消さない」と言い切っており、嘘になっている。
--
-- 適用済みのマイグレーションは編集しても本番に届かないので追補で直す。

COMMENT ON COLUMN password_reset_tokens.used_at IS
  '使用済みの日時。使い回しを「見つからない」ではなく「使用済み」として判定するために有効期限の内側では行を残す。期限切れの行は used_at の有無によらず日次CRONが消す（#1300）';
