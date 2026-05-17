-- ============================================
-- 座席Y座標をスタジアム配置に修正
-- 建築安全条例基準: 段差 8〜18cm/列
-- 前方列は緩やか(8cm)、後方列は急(18cm)で
-- 前列の観客の頭越しにスクリーンが見えるサイトラインを確保
-- ============================================
--
-- 列ごとの段差（累積）:
--   A列(1): 0.00m (基準)
--   B列(2): 0.08m (+8cm)
--   C列(3): 0.17m (+9cm)
--   D列(4): 0.28m (+11cm)
--   E列(5): 0.41m (+13cm)
--   F列(6): 0.56m (+15cm)
--   G列(7): 0.72m (+16cm)
--   H列(8): 0.89m (+17cm)
--   I列(9): 1.07m (+18cm)
--   J列(10):1.25m (+18cm)
--
-- 最大高低差: 1.25m（10列）
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_heights NUMERIC(6,2)[] := ARRAY[0.00, 0.08, 0.17, 0.28, 0.41, 0.56, 0.72, 0.89, 1.07, 1.25];
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_idx INTEGER;
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  FOR v_idx IN 1..10 LOOP
    UPDATE theater_seats
    SET position_y = v_heights[v_idx]
    WHERE theater_id = v_theater_id
      AND row_label = v_row_labels[v_idx];
  END LOOP;
END $$;
