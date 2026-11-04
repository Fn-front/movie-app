-- ============================================
-- award_movies の一意キーに person_name を含める
-- ============================================
--
-- 旧: UNIQUE (tmdb_movie_id, award_name, award_year, category)
--
-- person_name は後から追加された列で一意キーに入っていなかった。
-- 演技賞では同じ作品から複数人がノミネートされる（第82回ゴールデングローブ賞
-- 助演女優賞の『エミリア・ペレス』はセレーナ・ゴメスとゾーイ・サルダナの2人）。
-- 旧キーではこれが1行に潰れ、受賞者が後ろにいると受賞が丸ごと消えていた。
--
-- NULLS NOT DISTINCT を付けるのは、作品賞系で person_name が NULL になるため。
-- 既定（NULLS DISTINCT）だと NULL 同士が重複とみなされず、作品賞で同じ作品が
-- 何行でも入ってしまう。PostgreSQL 15 以降で使える（本番は 17.6）。

ALTER TABLE award_movies
  DROP CONSTRAINT IF EXISTS uq_award_movies_entry;

ALTER TABLE award_movies
  ADD CONSTRAINT uq_award_movies_entry
  UNIQUE NULLS NOT DISTINCT (
    tmdb_movie_id,
    award_name,
    award_year,
    category,
    person_name
  );
