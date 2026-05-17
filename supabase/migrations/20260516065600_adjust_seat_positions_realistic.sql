-- ============================================
-- Migration: 座席配置を実際の映画館の寸法に合わせて調整
-- ============================================
--
-- 標準的な映画館の寸法（業界調査ベース）:
-- - 席間隔(center-to-center): 0.55-0.6m（VIPで0.7m）
-- - 列ピッチ: 1.0-1.2m（プレミアム 1.5m+）
-- - 前列〜スクリーン距離: スクリーン幅 × 0.6 以上
--
-- 標準中規模シアター（slug: standard-medium）の調整内容:
-- - スクリーン幅 16m → 前列必要距離 ≥ 9.6m
-- - スクリーン center_z = 12.5 → A列 z = 2.9 にシフト
-- - 席x間隔 1.0m → 0.6m（中心 -7〜+7 → -4.2〜+4.2）
-- - 列z間隔は 1.1m を維持
-- - 床のY段差（リーガル感）は現状を維持
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_row_idx INTEGER;
  v_seat_num INTEGER;
  v_new_x NUMERIC(6, 2);
  v_new_z NUMERIC(6, 2);
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  IF v_theater_id IS NULL THEN
    RAISE NOTICE 'standard-medium シアターが見つからないためスキップ';
    RETURN;
  END IF;

  FOR v_row_idx IN 1..10 LOOP
    -- 新しいZ: A列(idx=1) = 2.9m、列ピッチ 1.1m で後方へ
    v_new_z := 2.9 - (v_row_idx - 1) * 1.1;

    FOR v_seat_num IN 1..15 LOOP
      -- 新しいX: 中央(seat_num=8) を 0、左右に 0.6m 間隔
      v_new_x := (v_seat_num - 8) * 0.6;

      UPDATE theater_seats
      SET position_x = v_new_x,
          position_z = v_new_z
      WHERE theater_id = v_theater_id
        AND row_label = v_row_labels[v_row_idx]
        AND seat_number = v_seat_num;
    END LOOP;
  END LOOP;
END $$;
