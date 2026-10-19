-- ============================================
-- consume_rate_limit をスライディングウィンドウ方式にする
-- ============================================
-- 背景:
--   20261017040000 の実装はカウンタが時間経過で減衰せず、`attempts` が 1 に戻るのは
--   ロックが明けたときだけだった。そのため `{ maxAttempts: 10, windowMinutes: 1 }` は
--   「1分あたり10回」ではなく「累計10回で1分ロック」として機能し、何分かけて操作しても
--   11回目で 429 になる。お気に入りを11件登録しただけで1分間ロックされていた（#758）。
--
--   変数名（p_window_minutes）も呼び出し側のコメントもスライディングウィンドウ前提で
--   書かれており、実装だけが異なっている状態だった。
--
-- 変更:
--   `last_attempt_at` から p_window_minutes を過ぎていれば attempts を 1 にリセットする
--   分岐を追加する。これで「直近 windowMinutes 以内に maxAttempts 回まで」という
--   直感どおりの意味になる。
--
-- セキュリティ系（login / otp_verify / totp_verify 等）への影響:
--   長期的な実効レートは変わらない。旧方式も「maxAttempts 回 → windowMinutes ロック →
--   カウンタ 1 に戻る」の繰り返しで、実効レートは maxAttempts / windowMinutes。
--   新方式も「windowMinutes 以内に maxAttempts 回まで」で同じ上限に収束する。
--   変わるのは「何時間も前の試行が今も枠を食っているか」だけで、総当たりの速度は
--   変わらない。間隔を空けた試行はリセットされるが、その場合そもそもレートが低い。
--
-- 挙動の優先順位（上から順に評価される）:
--   1. ロック中           → カウンタも時刻も動かさない（連打でロックが延びない）
--   2. ロック明け         → attempts=1 / locked_until=NULL にリセット
--   3. ウィンドウ経過     → attempts=1 にリセット（今回追加）
--   4. 上限到達           → locked_until を設定して拒否
--   5. それ以外           → attempts+1 で許可

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
  v_window_start TIMESTAMPTZ := now() - make_interval(mins => p_window_minutes);
  v_locked_until TIMESTAMPTZ;
BEGIN
  -- INSERT ... ON CONFLICT DO UPDATE で「行の作成」と「カウンタ更新」を
  -- 1ステートメントにまとめる。UNIQUE インデックス
  -- idx_rate_limits_identifier_action (identifier, action_type) が競合判定に使われ、
  -- 同時実行は行レベルロックで直列化される（#646）。
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
      -- 直近の試行からウィンドウが経過した: リセット（これが無いと累積方式になる）
      WHEN rate_limits.last_attempt_at <= v_window_start
        THEN 1
      ELSE rate_limits.attempts + 1
    END,
    locked_until = CASE
      WHEN rate_limits.locked_until IS NOT NULL
           AND rate_limits.locked_until > v_now
        THEN rate_limits.locked_until
      WHEN rate_limits.locked_until IS NOT NULL
        THEN NULL
      -- ウィンドウ経過時は上限判定より先に評価する。
      -- 順序を逆にすると「上限到達後に長時間放置した行」がリセットされずロックに入る。
      WHEN rate_limits.last_attempt_at <= v_window_start
        THEN NULL
      -- 上限到達: ロックへ移行
      WHEN rate_limits.attempts >= p_max_attempts
        THEN v_now + make_interval(mins => p_window_minutes)
      ELSE rate_limits.locked_until
    END,
    last_attempt_at = CASE
      -- ロック中は時刻も更新しない（ロック明けの判定基準をずらさないため）
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
  'レート制限の判定とカウンタ更新を原子的に行う（#646）。スライディングウィンドウ方式で、直近 p_window_minutes 以内に p_max_attempts 回まで許可し、超過すると同じ長さロックする（#758）。p_action_type は chk_action_type の許可リストに含まれる値であること。';

-- CREATE OR REPLACE は既存権限を保持するが、意図が読み取れるよう明示し直す
-- （.claude/rules/supabase-db.md）。20261018042537 と同じ内容。
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;
