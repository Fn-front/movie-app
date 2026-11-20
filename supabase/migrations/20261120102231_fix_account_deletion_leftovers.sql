-- 退会時の消し残りを塞ぐ（#932 のレビュー）
--
-- `20261120093701` で入れた `delete_user_account` に2つの消し残りがあった。
-- どちらも**メールアドレスやユーザー名が端末外に残り続ける**ので、
-- 「消去」を謳う機能としては成立していない。
--
-- ---------------------------------------------------------------------------
-- 1. otp_codes が消えていなかった
-- ---------------------------------------------------------------------------
-- ⚠️ `otp_codes` は **`user_id` 列も users への FK も持たない**
--   （`20260312000000_phase8_auth_tables.sql:75`。以降の ALTER でも足していない）。
--   紐づけは `email` 文字列だけなので **CASCADE に乗らない**。
--
--   前の版のコメントが「残り17テーブルは ON DELETE CASCADE で連鎖する」と
--   書いていたのが見落としの原因。実際に FK を持つのは15本で、
--   `otp_codes` はそこに入っていない。
--
--   残留期間は `OTP_CODE_RETENTION_HOURS`（48時間）＋ CRON の間隔。
--   退会者のメールアドレスがその間ずっと残る。
--
--   副作用として、同じアドレスで即再登録すると残った行が
--   `auth/otp/send` の60秒の再送間隔判定（最新行の `created_at` が根拠）に
--   効いてしまう。
--
-- ---------------------------------------------------------------------------
-- 2. ユーザー名由来の rate_limits が消えていなかった
-- ---------------------------------------------------------------------------
-- ⚠️ ログインの識別子は**メールアドレスとは限らない**。
--   `src/lib/auth/auth.ts:109` は `isEmailLogin ? email : username` を
--   `buildLoginIdentifier` に渡すので、admin 発行アカウント
--   （`users.username` を持つ）がログインすると `ユーザー名|IP` の行ができる。
--
--   前の版はメールアドレスの3形しか消しておらず、この4形目が残っていた。
--   中身はユーザー名と送信元IP。
--
-- ⚠️ `normalizeUsername` は**大文字化**する（`src/lib/auth/accountIdentity.ts`）。
--   `users.username` には入力されたままの値が入るため、識別子と一致しない
--   可能性がある。`upper()` で揃えてから突き合わせる。
--
-- ⚠️ `LIKE` を使わない理由は前の版と同じ。パターンとして解釈されると
--   他人の行まで消す。

CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_username TEXT;
  v_deleted_rate_limits INTEGER;
BEGIN
  -- 行ロックを取ってから進める。並行して同じ利用者を消そうとした場合に
  -- 片方が「対象なし」で抜けるのを防ぐ
  SELECT email, username INTO v_email, v_username
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'user not found: %', p_user_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM rate_limits
  WHERE identifier = p_user_id::text
     OR identifier = v_email
     OR starts_with(identifier, v_email || '|')
     -- ユーザー名でログインした分（admin 発行アカウント）
     OR (
       v_username IS NOT NULL
       AND (
         upper(identifier) = upper(v_username)
         OR starts_with(upper(identifier), upper(v_username) || '|')
       )
     );

  GET DIAGNOSTICS v_deleted_rate_limits = ROW_COUNT;

  -- ⚠️ CASCADE に乗らないのでここで消す
  DELETE FROM otp_codes WHERE email = v_email;

  -- FK を持つ15テーブルは ON DELETE CASCADE / SET NULL で連鎖する
  DELETE FROM users WHERE id = p_user_id;

  RETURN v_deleted_rate_limits;
END;
$$;

-- ⚠️ `CREATE OR REPLACE` は既存の権限を保持するが、意図を読めるように書き直す
REVOKE EXECUTE ON FUNCTION public.delete_user_account(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID) TO service_role;

COMMENT ON FUNCTION public.delete_user_account(UUID) IS
  'アカウントを物理削除する。rate_limits（利用者ID / メール / メール|IP / ユーザー名|IP）と otp_codes は FK を持たないため明示的に消す。戻り値は消した rate_limits の件数（#932）';
