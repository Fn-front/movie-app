-- ============================================
-- release_rate_limit RPC の追加
-- ============================================
-- 背景: `consume_rate_limit` でカウントしたあと、守ろうとした資源を実際には
-- 消費しなかった場合に枠を戻す手段が無かった（#1260）。
--
-- 具体的には `POST /api/auth/otp/send` が該当する。日次送信上限は
-- 「送信の直前」に数えるが（`.claude/rules/api-route.md` の例外2）、
-- Resend がエラーを返して1通も送れなかったときも枠は減ったままになる。
-- 利用者は「送信に失敗しました」と言われて再試行し、5回目で
-- 「本日の送信上限に達しました」に変わる。1通も届いていないのに。
--
-- `resetRateLimit`（行ごと DELETE）は使えない。あちらは「検証に成功したので
-- 全部チャラ」の意味で、ここで使うと**別の正当な送信で積んだ分まで消える**。
-- 必要なのは「今回の1回分だけ戻す」操作。
--
-- 原子性が要る理由は consume 側と同じ（#646）。SELECT → UPDATE に分けると、
-- 同時に失敗した2つのリクエストが同じ attempts を読み、片方のデクリメントが
-- 失われて枠が余分に残る。

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
  UPDATE rate_limits
  SET
    attempts = GREATEST(attempts - 1, 0),
    -- ⚠️ ロックも解除する。consume は上限到達時に attempts を +1 しつつ
    -- locked_until を立てる。その回の資源消費が失敗したなら、ロックも
    -- 成立していなかったことにしないと「1通も送らずに24時間ロック」が残る
    locked_until = NULL
  WHERE identifier = p_identifier
    AND action_type = p_action_type;
END;
$$;

COMMENT ON FUNCTION public.release_rate_limit(TEXT, TEXT) IS
  'consume_rate_limit で数えた1回分を戻す（#1260）。守る資源を実際には消費しなかったとき（メール送信の失敗など）に使う。行は消さずカウンタだけ減らす点が resetRateLimit と違う。';

-- 既定権限は 20261018042537 で絞っているが、意図が読み取れるよう明示する
-- （.claude/rules/supabase-db.md）。呼ぶのはサーバー側だけ
REVOKE EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rate_limit(TEXT, TEXT)
  TO service_role;
