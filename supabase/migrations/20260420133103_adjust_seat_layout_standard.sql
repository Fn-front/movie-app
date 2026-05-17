-- ============================================
-- 座席レイアウトを標準シネコン仕様に調整
--
-- 変更点:
--   前後ピッチ: 1.33m → 1.10m（標準シネコン基準）
--   最前列(A)→スクリーン距離: 7.5m → 8.0m（スクリーン幅16mの1/2）
--   最後列(J)→スクリーン距離: 19.5m → 17.9m
--
-- 座席Z座標:
--   A列: +4.50m（スクリーンZ=12.5から8.0m）
--   B列: +3.40m
--   C列: +2.30m
--   D列: +1.20m
--   E列: +0.10m
--   F列: -1.00m
--   G列: -2.10m  ← ベスポジ（150席規模で7列目）
--   H列: -3.20m
--   I列: -4.30m
--   J列: -5.40m
--
-- 参考:
--   映画館座席ピッチ標準: 約110cm（RAMSA調べ）
--   最前列推奨距離: スクリーン幅の1/2以上
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_z_positions NUMERIC(6,2)[] := ARRAY[4.50, 3.40, 2.30, 1.20, 0.10, -1.00, -2.10, -3.20, -4.30, -5.40];
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
