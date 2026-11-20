-- 確認コードの試行回数を原子的に加算する（#1284）
--
-- ⛔ **read-then-write では同時実行で加算が失われる。**
--
--   ```ts
--   const { data: row } = await supabase.from('otp_codes').select('attempts')...
--   await supabase.from('otp_codes').update({ attempts: row.attempts + 1 })...
--   ```
--
--   N 並列で誤ったコードを投げると、全員が同じ `attempts` を読んで同じ値を
--   書き戻すため、**0→1 が N 回**起きるだけで済む。`otp_codes.attempts` の
--   5回上限が設計意図どおりに機能していない。
--
--   コードの消費側は条件付き DELETE の削除行数で原子的に判定できているのに、
--   試行回数だけが漏れていた。
--
-- ⚠️ **直ちに総当たりが成立するわけではない。** 到達点はすべて上位の
--   原子的なレート制限（`consume_rate_limit` RPC）が止める。それでも
--   「多層防御の1枚」として足したものが効いていない状態は、次の読み手が
--   効いていると誤解するため直す。
--
-- ⚠️ PostgREST から `attempts = attempts + 1` という式は書けない。
--   `consume_rate_limit` / `release_rate_limit` と同じく RPC が要る。

-- ---------------------------------------------------------------------------
-- increment_otp_attempts
-- ---------------------------------------------------------------------------
-- ⚠️ **上限で頭打ちにする。** `chk_otp_attempts` が `attempts <= 5` なので、
--   素の `attempts + 1` は6回目で 23514 を投げる。呼び出し側は「上限に
--   達している」を**加算の前**に判定しているが、同時実行ではその判定を
--   すり抜けた2本が同時に 5→6 を試みうる。
--
--   `LEAST` で止めれば、上限に達した後の加算は**何回呼んでも 5 のまま**。
--   利用者から見た挙動（上限超過）は変わらない。
--
-- ⚠️ 戻り値は**加算後**の値。`auth/otp/verify` は「この回で上限に達したか」で
--   文言と導線を出し分けている（#1248）。読み直すと、そこでまた競合する。

CREATE OR REPLACE FUNCTION public.increment_otp_attempts(p_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts INTEGER;
BEGIN
  UPDATE otp_codes
  SET attempts = LEAST(attempts + 1, 5)
  WHERE id = p_id
  RETURNING attempts INTO v_attempts;

  -- 行が無い（期限切れの掃除と競合した等）。呼び出し側は「もう無い」として
  -- 扱えばよいので、上限値を返して「これ以上試せない」に寄せる
  IF NOT FOUND THEN
    RETURN 5;
  END IF;

  RETURN v_attempts;
END;
$$;

COMMENT ON FUNCTION public.increment_otp_attempts(UUID) IS
  'otp_codes.attempts を原子的に加算して加算後の値を返す。read-then-write だと同時実行で加算が失われる（#1284）。上限5で頭打ちにして chk_otp_attempts の 23514 を避ける。行が無ければ 5 を返す';

-- ⚠️ `FROM PUBLIC` だけでは不十分。Supabase の既定付与で anon / authenticated に
--   残り、公開されている anon キーから `POST /rest/v1/rpc/` で到達できる
REVOKE EXECUTE ON FUNCTION public.increment_otp_attempts(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_otp_attempts(UUID) TO service_role;
