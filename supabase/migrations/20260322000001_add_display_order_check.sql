-- ============================================
-- award_movies.display_order に CHECK 制約を追加
-- ============================================

ALTER TABLE award_movies
  ADD CONSTRAINT chk_award_movies_display_order CHECK (display_order >= 0);
