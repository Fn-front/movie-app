-- ============================================
-- release_rate_limit の許可リストに two_factor_send_prompt を足す
-- ============================================
-- ⛔ **被害者自身の再試行がロックを延長していた**（GHSA-p899-6g7w-v7hg の
--   レビューで実測）。
--
--   送信元ごとの層（`two_factor_send_prompt`）は `two_factor_send` より
--   **手前**にある。攻撃者が被害者の `two_factor_send` を枯らした後は、
--   被害者が再試行するたびに
--
--     1. prompt 枠を1つ消費する
--     2. `two_factor_send` に当たって弾かれる
--     3. **1通も送られない**
--
--   という形になり、上限（3回）に達すると**被害者自身の `メール|IP` 行**に
--   `locked_until = now + 60分` が立つ。攻撃者由来のロックが明けた後も、
--   被害者はさらに最大40分ログインできない。
--
--   これは #1260 / #1266 と同じ「1つも消費しなかったら戻す」の話で、
--   層を1つ足したときに同じ手当てを忘れていた。
--
-- `two_factor_send_prompt` を許可してよい理由:
--
--   数えているのは**コードを何通送らせたか**であって、検証の試行回数では
--   ない（そちらは `totp_verify` / `otp_verify` が別に持つ）。
--   戻すのは `two_factor_send` が拒否したときだけで、その時点で
--   **1通も送られていない**ので第2要素の総当たりの余地は増えない。
--
-- ⚠️ 攻撃者には利得が無い。戻すのは「prompt を通過して `two_factor_send` で
--   止まった」場合だけで、prompt 上限に達している送信元はそもそも
--   `two_factor_send` へ到達しない（＝戻らない）。枯らした本人の枠は
--   減ったまま残る。
--
-- ⚠️ 適用済みのマイグレーションは書き換えない。追記で直す。

CREATE OR REPLACE FUNCTION public.release_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 戻してよいアクションだけを列挙する（増やすときはここへ追加）。
  --
  -- ⚠️ 判断の基準は「`FAIL_CLOSED_ACTIONS` かどうか」ではない。
  -- どれもそのリストに入っている。見るべきは**何を数えているか**で、
  -- 「送った通数」なら戻してよく、「検証の試行回数」なら戻してはいけない。
  -- 後者で戻すと、総当たりのロックを解除する手段になる。
  IF p_action_type <> ALL (ARRAY['otp_send_daily', 'two_factor_send', 'two_factor_send_prompt']) THEN
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
    -- 成立していなかったことにしないと「1通も送らずにロック」が残る。
    --
    -- これが危険になりうるのは検証の試行回数に使われたときだけで、
    -- 上の許可リストがそれを防いでいる
    locked_until = NULL
  WHERE identifier = p_identifier
    AND action_type = p_action_type;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.release_rate_limit(TEXT, TEXT) IS
  'consume_rate_limit で数えた1回分を戻す（#1260）。守る資源を実際には消費しなかったときに使う。行は消さずカウンタだけ減らす点が resetRateLimit と違う。⚠️ locked_until も消すため、許可リスト（otp_send_daily / two_factor_send / two_factor_send_prompt）以外では例外を投げる。総当たりを止めるアクションへ転用するとロック解除の手段になる（#1266）。';
