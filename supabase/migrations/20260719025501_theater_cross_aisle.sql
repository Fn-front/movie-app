-- ============================================
-- Migration: 横通路（クロスアイル）を追加
-- ============================================
--
-- 調査(実在館の座席平面)より、日本の映画館は列を直線に並べつつ、
-- スタジアム段床の途中に「横通路(cross aisle=前後を分ける横方向の通路)」を
-- 設けるのが一般的（法令上も縦20列以下ごと＋最前部に横通路。大型館では
-- 中段に前通路を持つ＝グランドシネマ池袋IMAX等）。
--
-- 現状は前後が連続した1ゾーンで「縦にきれいに積みすぎ」だったため、
-- 各劇場の中段(約1/2列目)の後ろに横通路を1本入れて前後ゾーンに分ける。
-- 実装は「横通路より後方の列を Z方向に 1.0m 後退」させるだけ（席数・X配置・
-- 傾斜Yは不変）。傾斜床・段差LED・ヒートマップ範囲はフロントが座席データから
-- 自動導出するため追従する。
--
-- 横通路位置(この列の後ろに通路): round(列数×0.5)
--   standard=7 / imax=8 / dolby=7 / tcx=8
-- ============================================

DO $$
DECLARE
  cfg RECORD;
  v_theater_id UUID;
  v_cross INTEGER;
  v_gap CONSTANT NUMERIC := 1.0;  -- 横通路幅(m)
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('standard-medium', 14),
      ('imax-gt',         16),
      ('dolby-cinema',    13),
      ('tcx',             16)
    ) AS t(slug, nrows)
  LOOP
    SELECT id INTO v_theater_id FROM theaters WHERE slug = cfg.slug;
    IF v_theater_id IS NULL THEN
      CONTINUE;
    END IF;

    v_cross := round(cfg.nrows * 0.5);

    -- 横通路より後方の列（row_label が v_cross 列目より後）を 1.0m 後退させる
    UPDATE theater_seats
    SET position_z = position_z - v_gap
    WHERE theater_id = v_theater_id
      AND row_label > chr(64 + v_cross);
  END LOOP;
END $$;
