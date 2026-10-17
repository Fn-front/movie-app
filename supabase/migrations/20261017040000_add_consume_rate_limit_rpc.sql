-- ============================================
-- consume_rate_limit RPC の追加
-- ============================================
-- 背景: checkRateLimit は SELECT → UPDATE の読み取り後書き込みで実装されており
-- 原子性がない。①現在値を読む と ②+1して書き戻す の間に別リクエストが①を
-- 実行すると、同じ attempts を読んだ複数のリクエストが全て「上限未満」と判定され、
-- 書き込みは最後の1つで上書きされる。結果、並行度に応じて実効上限を超える（#646）。
--
-- Supabase JS は複数リクエストにまたがるトランザクションを張れないため
-- （20261016124302 で upsert_recommendations を追加したのと同じ理由）、
-- 判定とカウンタ更新を1ステートメントにまとめる。
--
-- 挙動は既存の checkRateLimit を踏襲する:
--   - 行が無ければ attempts=1 で作成し許可
--   - locked_until が未来ならロック中として拒否（残り秒数を返す）
--   - locked_until を過ぎていれば attempts=1 にリセットして許可
--   - attempts が上限以上なら locked_until を設定して拒否
--   - それ以外は attempts を +1 して許可

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT,
  p_max_attempts INTEGER,
  p_window_minutes INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_locked_until TIMESTAMPTZ;
BEGIN
  -- INSERT ... ON CONFLICT DO UPDATE で「行の作成」と「カウンタ更新」を
  -- 1ステートメントにまとめる。UNIQUE インデックス
  -- idx_rate_limits_identifier_action (identifier, action_type) が競合判定に使われ、
  -- 同時実行は行レベルロックで直列化される。
  INSERT INTO rate_limits (identifier, action_type, attempts, last_attempt_at)
  VALUES (p_identifier, p_action_type, 1, v_now)
  ON CONFLICT (identifier, action_type) DO UPDATE
  SET
    attempts = CASE
      -- ロック中: カウンタを動かさない（連打でロックが延びないようにする）
      WHEN rate_limits.locked_until IS NOT NULL
           AND rate_limits.locked_until > v_now
        THEN rate_limits.attempts
      -- ロック期間が明けた: リセット
      WHEN rate_limits.locked_until IS NOT NULL
        THEN 1
      -- 上限到達・通常のインクリメント（既存実装に合わせどちらも +1）
      ELSE rate_limits.attempts + 1
    END,
    locked_until = CASE
      WHEN rate_limits.locked_until IS NOT NULL
           AND rate_limits.locked_until > v_now
        THEN rate_limits.locked_until
      WHEN rate_limits.locked_until IS NOT NULL
        THEN NULL
      -- 上限到達: ロックへ移行
      WHEN rate_limits.attempts >= p_max_attempts
        THEN v_now + make_interval(mins => p_window_minutes)
      ELSE rate_limits.locked_until
    END,
    last_attempt_at = CASE
      -- ロック中は時刻も更新しない（既存実装と同じ）
      WHEN rate_limits.locked_until IS NOT NULL
           AND rate_limits.locked_until > v_now
        THEN rate_limits.last_attempt_at
      ELSE v_now
    END
  RETURNING rate_limits.locked_until INTO v_locked_until;

  IF v_locked_until IS NOT NULL AND v_locked_until > v_now THEN
    RETURN QUERY
      SELECT false, CEIL(EXTRACT(EPOCH FROM (v_locked_until - v_now)))::INTEGER;
  ELSE
    RETURN QUERY SELECT true, NULL::INTEGER;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) IS
  'レート制限の判定とカウンタ更新を原子的に行う。SELECT→UPDATE の読み取り後書き込みでは並行リクエストが実効上限を超えられるため（#646）。p_action_type は chk_action_type の許可リストに含まれる値であること。';
