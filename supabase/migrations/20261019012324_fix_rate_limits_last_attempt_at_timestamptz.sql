-- rate_limits.last_attempt_at を TIMESTAMPTZ に変換する
--
-- 背景:
--   20260628111105 で OTP/認証系の naive TIMESTAMP を TIMESTAMPTZ 化したが、
--   rate_limits は locked_until だけが対象で last_attempt_at が漏れていた。
--
--   naive 値は PostgREST が TZ サフィックス無し（2026-10-19T03:00:00）で返すため、
--   JS の `new Date()` がローカル時刻として解釈する。JST のアプリサーバーでは
--   実時刻より 9 時間古く見え、checkCooldown（rateLimit.ts）の経過時間が常に
--   クールダウンを上回る。結果、レコメンド手動更新の連打防止が無言で無効になる
--   （本番/CI は UTC のため顕在化しない）。
--
-- 対応:
--   既存値は UTC の壁時計で書き込まれている（セッション TZ=UTC の now()、
--   およびレガシー経路の toISOString()）ため `AT TIME ZONE 'UTC'` で正しく
--   再解釈される。DEFAULT now() はそのまま timestamptz に適合する。
--
--   同テーブルの locked_until は 20260628111105 で同じ方法で変換済みであり、
--   rate_limits の RLS ポリシーは 20260318000000 ですべて DROP されているため、
--   #268 の「ポリシー依存による型変更エラー」は起きない。
--
-- 棚卸し（完了条件: JS で時刻比較している naive カラムが他に無いか）:
--   movie_cache.cached_at が naive のまま残っており、src/app/api/movies/route.ts
--   で `new Date()` 比較されている。実害の性質が異なる（キャッシュが常に失効扱いに
--   なり TMDb を毎回叩く）ため別Issueとして切り出す。
--   それ以外の naive カラム（created_at / updated_at / added_at / deleted_at 等）は
--   JS 側で時刻比較しておらず、表示・ソート用途のみのため影響しない。

ALTER TABLE rate_limits
  ALTER COLUMN last_attempt_at TYPE TIMESTAMPTZ
  USING last_attempt_at AT TIME ZONE 'UTC';

COMMENT ON COLUMN rate_limits.last_attempt_at IS
  '直近の試行時刻。checkCooldown が JS 側で new Date() 比較するため TIMESTAMPTZ 必須（naive に戻すと非UTC環境でクールダウンが素通りする）。';
