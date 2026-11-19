-- ============================================
-- release_rate_limit の許可リストに two_factor_send を足す（#1266）
-- ============================================
-- 直前の `20261119090254_restrict_release_rate_limit_to_allowlist.sql` で
-- 許可リストを `otp_send_daily` だけにしたが、**呼び出し元を1つ見落としていた**。
--
--   src/lib/auth/sendSecondFactorCode.ts:156
--     第2要素のコード送信に失敗したとき `two_factor_send` の枠を戻す
--
-- そのままだと RPC が例外を投げ、`releaseRateLimit` は例外にしない契約なので
-- 警告ログだけ出して枠が戻らない。第2要素では**ログインそのものができなく
-- なる**（数回の送信失敗で1時間締め出される）ため、#1258 の行き止まりが
-- そのまま再発する。
--
-- ⚠️ 適用済みのマイグレーションは書き換えない（履歴とDBの実体が乖離する）。
-- 追記で直す。
--
-- `two_factor_send` を許可してよい理由:
-- これは**コードを何通送れるか**の上限であって、検証の試行回数ではない
-- （そちらは `totp_verify` / `otp_verify` が別に持つ）。送信に失敗したなら
-- 1通も届いていないので、枠を戻しても総当たりの余地は増えない。
-- `otp_send_daily` とまったく同じ形。

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
  -- 戻してよいアクションだけを列挙する（増やすときはここへ追加）。
  --
  -- ⚠️ 判断の基準は「`FAIL_CLOSED_ACTIONS` かどうか」ではない。
  -- どちらもそのリストに入っている。見るべきは**何を数えているか**で、
  -- 「送った通数」なら戻してよく、「検証の試行回数」なら戻してはいけない。
  -- 後者で戻すと、総当たりのロックを解除する手段になる。
  IF p_action_type <> ALL (ARRAY['otp_send_daily', 'two_factor_send']) THEN
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

COMMENT ON FUNCTION public.release_rate_limit(TEXT, TEXT) IS
  'consume_rate_limit で数えた1回分を戻す（#1260）。守る資源を実際には消費しなかったとき（メール送信の失敗など）に使う。行は消さずカウンタだけ減らす点が resetRateLimit と違う。⚠️ locked_until も消すため、許可リスト（otp_send_daily / two_factor_send）以外では例外を投げる。検証の試行回数を数えるアクションへ転用するとロック解除の手段になる（#1266）。';

REVOKE EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  TO service_role;
