-- ============================================
-- 最前列→スクリーン距離を8m→4mに修正
-- 日本のシネコン中規模(150席)の実態に合わせる
--
-- A列: +8.50m（スクリーンZ=12.5から4.0m）
-- B列: +7.40m
-- C列: +6.30m
-- D列: +5.20m
-- E列: +4.10m
-- F列: +3.00m
-- G列: +1.90m
-- H列: +0.80m
-- I列: -0.30m
-- J列: -1.40m（スクリーンから13.9m）
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_z_positions NUMERIC(6,2)[] := ARRAY[8.50, 7.40, 6.30, 5.20, 4.10, 3.00, 1.90, 0.80, -0.30, -1.40];
  v_idx INTEGER;
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  FOR v_idx IN 1..10 LOOP
    UPDATE theater_seats
    SET position_z = v_z_positions[v_idx]
    WHERE theater_id = v_theater_id
      AND row_label = v_row_labels[v_idx];
  END LOOP;
END $$;
