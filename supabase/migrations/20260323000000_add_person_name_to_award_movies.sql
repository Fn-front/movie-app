-- ============================================
-- award_movies に person_name カラム追加
-- 監督賞・演技賞などで人名を表示するため
-- ============================================

ALTER TABLE award_movies
  ADD COLUMN IF NOT EXISTS person_name VARCHAR(255);
