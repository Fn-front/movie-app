-- ============================================
-- release_rate_limit を許可リスト方式にする（#1266）
-- ============================================
-- 背景: `release_rate_limit`（#1260 / #1263）は `locked_until` を**無条件で
-- NULL にする**。唯一の呼び出し元（`otp_send_daily`）では安全だが、関数自体は
-- `p_action_type` を問わないため、`login` / `otp_verify` / `totp_verify` など
-- 総当たりを止めるためのアクションへ転用されると、**ロック解除の手段**になる。
-- 「コードの検証に失敗したら枠を戻す」ような実装を足した瞬間に成立する。
--
-- ⚠️ 対策として「`FAIL_CLOSED_ACTIONS` を弾く」は**採れない**。
-- `otp_send_daily` 自身がそのリストに入っているため（`src/constants/rateLimit.ts`）、
-- 唯一の正当な呼び出し元まで弾いてしまう。拒否リストはここでは成立しない。
--
-- そこで**許可リスト**にする。戻してよいアクションは「数えた資源を実際には
-- 消費しなかった」と言い切れるものだけで、現状はメールの日次送信枠のみ。
-- 増やすときはマイグレーションが要る。セキュリティに効く機能にその程度の
-- 摩擦があるのはむしろ望ましい。
--
-- 許可リストの二重管理について: TypeScript 側にも
-- `RELEASABLE_RATE_LIMIT_ACTIONS` を置いて引数の型を絞っている。ずれたときは
-- **この関数が例外を投げて止まる**（枠が戻らないだけで、ロックは解除されない）
-- ので、食い違いは安全側に倒れる。`FAIL_CLOSED_ACTIONS` を追う必要も無い。

CREATE OR REPLACE FUNCTION public.release_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 戻してよいアクションだけを列挙する（増やすときはここへ追加）
  IF p_action_type <> ALL (ARRAY['otp_send_daily']) THEN
    RAISE EXCEPTION
      'release_rate_limit は許可リストに無いアクションには使えません: %',
      p_action_type
      USING ERRCODE = '22023';
  END IF;

  UPDATE rate_limits
  SET
    attempts = GREATEST(attempts - 1, 0),
    -- ⚠️ ロックも解除する。consume は上限到達時に attempts を +1 しつつ
    -- locked_until を立てる。その回の資源消費が失敗したなら、ロックも
    -- 成立していなかったことにしないと「1通も送らずに24時間ロック」が残る。
    --
    -- これが危険になりうるのは総当たりを止めるアクションに使われたときだけで、
    -- 上の許可リストがそれを防いでいる
    locked_until = NULL
  WHERE identifier = p_identifier
    AND action_type = p_action_type;
END;
$$;

COMMENT ON FUNCTION public.release_rate_limit(TEXT, TEXT) IS
  'consume_rate_limit で数えた1回分を戻す（#1260）。守る資源を実際には消費しなかったとき（メール送信の失敗など）に使う。行は消さずカウンタだけ減らす点が resetRateLimit と違う。⚠️ locked_until も消すため、許可リスト（現状 otp_send_daily のみ）以外では例外を投げる。総当たりを止めるアクションへ転用するとロック解除の手段になる（#1266）。';

-- 権限は変更なし。`CREATE OR REPLACE` は既存権限を保持するが、意図が
-- 読み取れるよう明示する（.claude/rules/supabase-db.md）
REVOKE EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  TO service_role;
