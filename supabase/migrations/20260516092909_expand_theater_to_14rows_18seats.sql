-- ============================================
-- Migration: TOHO中規模シアター相当に拡張（14列×18席=252席）
-- ============================================
--
-- これまでの 10列×15席=150席は「こじんまり」した印象。
-- TOHOシネマズ中規模シアター（200-300席）相当に拡張する。
--
-- 変更内容:
-- - 列数: 10 → 14 (A〜N)
-- - 席数/列: 15 → 18
-- - 総席数: 150 → 252
-- - 部屋幅: 20 → 22m
-- - 部屋奥行: 17 → 21m
-- - スクリーン幅: 16 → 18m
-- - スクリーン高: 7 → 7.5m (アスペクト 2.4:1 シネマスコープ)
-- - screen_center_z: 8.5 → 10.5
--
-- 寸法計算:
-- - 前列〜スクリーン: 5m
-- - 座席エリア奥行: 13 gaps × 1.1m = 14.3m (A列z=5.5 〜 N列z=-8.8)
-- - 後列〜後壁: 1.7m
-- - 合計: 21m ✓
-- - 座席エリア幅: 17 gaps × 0.6m = 10.2m
-- - 側壁との余白: (22-10.2)/2 = 5.9m × 2 (側面歩道+スピーカー余白)
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N'];
  -- 段差Y: 既存A〜Jの値を維持し、K〜Nは増加パターンを延長
  v_y_values NUMERIC[] := ARRAY[0, 0.2, 0.43, 0.7, 1.03, 1.4, 1.8, 2.23, 2.68, 3.13, 3.60, 4.10, 4.65, 5.25];
  v_row_idx INTEGER;
  v_seat_num INTEGER;
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  IF v_theater_id IS NULL THEN
    RAISE NOTICE 'standard-medium not found';
    RETURN;
  END IF;

  -- 1. 部屋・スクリーン寸法を更新
  UPDATE theaters
  SET room_width = 22,
      room_depth = 21,
      screen_width = 18,
      screen_height = 7.5,
      screen_center_y = 4.0,
      screen_center_z = 10.5,
      description = 'Dolby Atmos 9.1.6 標準配置のサンプル劇場。14列×18席＝252席。'
  WHERE id = v_theater_id;

  -- 2. 既存座席を全削除して再生成（14列 × 18席）
  DELETE FROM theater_seats WHERE theater_id = v_theater_id;

  FOR v_row_idx IN 1..14 LOOP
    FOR v_seat_num IN 1..18 LOOP
      INSERT INTO theater_seats (
        theater_id, row_label, seat_number,
        position_x, position_y, position_z, seat_type
      ) VALUES (
        v_theater_id,
        v_row_labels[v_row_idx],
        v_seat_num,
        (v_seat_num - 9.5) * 0.6, -- 中心は 9 と 10 の間
        v_y_values[v_row_idx],
        5.5 - (v_row_idx - 1) * 1.1, -- A列 5.5、列ピッチ 1.1m
        'standard'
      );
    END LOOP;
  END LOOP;

  -- 3. スピーカー位置を新しい部屋寸法に合わせて更新
  -- L/R: スクリーン端寄り、新スクリーン端 ±9 → ±8 にやや内側
  UPDATE theater_speakers SET position_x = -8, position_z = 10
    WHERE theater_id = v_theater_id AND channel = 'L';
  UPDATE theater_speakers SET position_x = 8, position_z = 10
    WHERE theater_id = v_theater_id AND channel = 'R';
  -- C: スクリーン中心
  UPDATE theater_speakers SET position_z = 10.5
    WHERE theater_id = v_theater_id AND channel = 'C';
  -- LFE
  UPDATE theater_speakers SET position_z = 10
    WHERE theater_id = v_theater_id AND channel = 'LFE';
  -- LSS/RSS: 側壁 ±11、座席エリア中央 z=-1.65
  UPDATE theater_speakers SET position_x = -11, position_z = -1.5
    WHERE theater_id = v_theater_id AND channel = 'LSS';
  UPDATE theater_speakers SET position_x = 11, position_z = -1.5
    WHERE theater_id = v_theater_id AND channel = 'RSS';
  -- LSW/RSW (Wide): 側壁、A列付近
  UPDATE theater_speakers SET position_x = -11, position_z = 5
    WHERE theater_id = v_theater_id AND channel = 'LSW';
  UPDATE theater_speakers SET position_x = 11, position_z = 5
    WHERE theater_id = v_theater_id AND channel = 'RSW';
  -- LBS/RBS: 新後壁 -10.5 の前方 0.5m
  UPDATE theater_speakers SET position_z = -10
    WHERE theater_id = v_theater_id AND channel = 'LBS';
  UPDATE theater_speakers SET position_z = -10
    WHERE theater_id = v_theater_id AND channel = 'RBS';
  -- LTF/RTF (天井前): A列上空
  UPDATE theater_speakers SET position_x = -5, position_z = 5
    WHERE theater_id = v_theater_id AND channel = 'LTF';
  UPDATE theater_speakers SET position_x = 5, position_z = 5
    WHERE theater_id = v_theater_id AND channel = 'RTF';
  -- LTM/RTM (天井中): 座席エリア中央上空
  UPDATE theater_speakers SET position_x = -5, position_z = -1.5
    WHERE theater_id = v_theater_id AND channel = 'LTM';
  UPDATE theater_speakers SET position_x = 5, position_z = -1.5
    WHERE theater_id = v_theater_id AND channel = 'RTM';
  -- LTR/RTR (天井後): N列上空
  UPDATE theater_speakers SET position_x = -5, position_z = -8
    WHERE theater_id = v_theater_id AND channel = 'LTR';
  UPDATE theater_speakers SET position_x = 5, position_z = -8
    WHERE theater_id = v_theater_id AND channel = 'RTR';
END $$;
