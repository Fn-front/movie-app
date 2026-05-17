-- ============================================
-- 座席Y座標を強化（床勾配の視認性改善）
--
-- 変更前: 1.25m高低差（段差 8〜18cm/列）
-- 変更後: 3.13m高低差（段差 20〜45cm/列）
--
-- 2次曲線的に増加（前方は緩やか、後方は急）
-- 中規模シネコンの実測値に近い値
--
-- 列ごとの段差（累積）:
--   A列(1): 0.00m (基準)
--   B列(2): 0.20m (+20cm)
--   C列(3): 0.43m (+23cm)
--   D列(4): 0.70m (+27cm)
--   E列(5): 1.03m (+33cm) ← 中央から急になる
--   F列(6): 1.40m (+37cm)
--   G列(7): 1.80m (+40cm)
--   H列(8): 2.23m (+43cm)
--   I列(9): 2.68m (+45cm)
--   J列(10):3.13m (+45cm)
--
-- 最大高低差: 3.13m（10列）
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_heights NUMERIC(6,2)[] := ARRAY[0.00, 0.20, 0.43, 0.70, 1.03, 1.40, 1.80, 2.23, 2.68, 3.13];
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
