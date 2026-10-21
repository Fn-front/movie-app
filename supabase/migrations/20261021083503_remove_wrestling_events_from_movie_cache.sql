-- プロレス興行（試合そのものの配信）を movie_cache から削除する
--
-- 背景:
--   TJPW / STARDOM / センダイガールズ / Marigold / DDT 等の興行配信が
--   配信タブに並んでいた。映画作品ではないため除く。
--   今後の流入は src/lib/movies/wrestlingEvent.ts の保存前フィルタが防ぐ。
--
-- ID を列挙している理由:
--   アプリ側はTMDbキーワード（団体キーワード、または wrestling 系＋タイトル語）で
--   判定するが、キーワードはDBに持っていないためSQLで同じ条件を書けない。
--
--   タイトル語だけで DELETE すると誤爆する。`興行` は
--   『エヴァンゲリオン放送30周年記念特別興行』（アニメのイベント上映）を、
--   `大会` や団体名は将来の無関係な作品を巻き込みうる。
--   キーワードで裏取りできた15件に限って削除する。

DELETE FROM public.movie_cache
WHERE id IN (
  1631275, -- センダイガールズプロレスリング in 大阪 ～Acceleration～
  1637761, -- DDT Judgement 2026～旗揚げ29周年記念大会5時間スペシャル～
  1642376, -- TJPW GRAND PRINCESS '26 : FATE IN RYOGOKU
  1644653, -- センダイガールズプロレスリング in 大阪 アゼリア大正ホール
  1644660, -- センダイガールズプロレスリング in 愛知 刈谷市産業振興センター
  1644684, -- STARDOM CINDERELLA TOURNAMENT 2026 〜開幕戦day1〜
  1644701, -- STARDOM CINDERELLA TOURNAMENT 2026 ～2回戦～
  1644711, -- STARDOM CINDERELLA TOURNAMENT 2026 ～優勝決定戦～
  1645181, -- Marigold Spring Victory Series 2026 ~ Day 2
  1649548, -- TJPW Texas Stampede in Austin ~ Day 2
  1649553, -- TJPW Texas Stampede in Dallas
  1650627, -- センダイガールズプロレスリング in 仙台PIT
  1650741, -- Marigold Spring Victory Series 2026 ~ Day 6
  1656587, -- TJPW SPRING TOUR 2026～NEXT DOOR～in FUKUOKA
  1763711  -- ハイパーミサヲプロデュース興行『HYPE!4』
);
