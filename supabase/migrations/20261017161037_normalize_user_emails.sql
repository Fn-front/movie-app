-- ============================================
-- メールアドレスの正規化と大小文字を区別しない一意制約
-- ============================================
-- 背景:
-- users.email は VARCHAR(255) UNIQUE で**大小文字を区別する**ため、
-- victim@example.com と Victim@example.com が別アカウント・別レート制限
-- カウンタとして共存できた。これにより、
--   - 表記を変えるだけで登録上限・OTP日次送信上限を回避し、同一メールボックスへ
--     確認コードメールを無制限に送れる
--   - OAuth の「メール一致で既存アカウントへリンク」が表記違いで取りこぼし、
--     同一人物の重複アカウントが黙って作られる
-- という問題が起きていた。
--
-- アプリ側は src/utils/email.ts の normalizeEmail() を全入口に通すようにしたので、
-- DB 側でも既存行を正規化し、大小文字を区別しない一意制約で後戻りを防ぐ。

-- --------------------------------------------
-- 1. 重複の検出（自動マージはしない）
-- --------------------------------------------
-- 大小文字だけが異なる行が実在する場合、どちらを残すかは
-- 「お気に入り・ウォッチリスト等の子レコードをどう付け替えるか」という
-- 業務判断を伴う。ここで機械的にマージすると復旧不能な統合事故になりうるため、
-- 検出したら中断し、運用者に手動解決を促す。
--
-- 手動解決の手順:
--   1) 下のクエリで重複グループを確認する
--        SELECT lower(email) AS normalized, count(*), array_agg(id) AS ids
--        FROM public.users GROUP BY lower(email) HAVING count(*) > 1;
--   2) 残す行を決める（is_verified = true を優先、同条件なら created_at が古い方）
--   3) 捨てる行を参照している子テーブルの user_id を残す行へ付け替える
--      （accounts / watchlist / favorites / dismissed_movies / saved_filters /
--        user_settings / recommendations / recommendation_refreshes /
--        recommendation_events / user_preferences / reviews）
--      ※ favorites 等は (user_id, tmdb_movie_id) の UNIQUE があるため、
--        付け替え前に重複行を削除すること
--   4) 捨てる行を DELETE し、このマイグレーションを再実行する

DO $$
DECLARE
  duplicate_count INTEGER;
  sample TEXT;
BEGIN
  SELECT count(*), coalesce(string_agg(normalized, ', '), '')
    INTO duplicate_count, sample
  FROM (
    SELECT lower(trim(email)) AS normalized
    FROM public.users
    GROUP BY lower(trim(email))
    HAVING count(*) > 1
    LIMIT 10
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      '大小文字だけが異なる users.email が % グループ存在します（例: %）。'
      '手動で名寄せしてから再実行してください（手順は本マイグレーションのコメント参照）。',
      duplicate_count, sample;
  END IF;
END
$$;

-- --------------------------------------------
-- 2. 既存の OTP を全削除
-- --------------------------------------------
-- otp_codes.code_hash は HMAC(code, email) で、メールアドレスを入力に含む
-- （20261017050000_add_otp_code_hash.sql / src/lib/otp/hashOtpCode.ts）。
-- email を正規化すると既存ハッシュは照合できなくなるため、行を残すと
-- 「コードは届いているのに必ず弾かれる」状態になる。
-- OTP は 10 分で失効する短命データなので、再送で復旧できる削除を選ぶ。
DELETE FROM public.otp_codes;

-- --------------------------------------------
-- 3. 既存行の正規化
-- --------------------------------------------
UPDATE public.users
SET email = lower(trim(email))
WHERE email <> lower(trim(email));

-- --------------------------------------------
-- 4. 大小文字を区別しない一意制約
-- --------------------------------------------
-- 既存の UNIQUE(email) はそのまま残す（この式インデックスのほうが厳しいため
-- 実質的に上書きされる）。アプリ側の正規化が将来崩れても、DB が最後の砦になる。
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
  ON public.users (lower(email));

COMMENT ON INDEX public.idx_users_email_lower IS
  'メールアドレスを大小文字を区別せず一意にする。アプリ側の正規化（src/utils/email.ts）が崩れても重複アカウントを作らせないための砦。';
