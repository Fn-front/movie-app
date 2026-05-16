-- ============================================
-- Migration: 座席を「横長」レイアウトに再構成 (10列×25席=250席)
-- ============================================
--
-- 前回 (20260516092909) で 14列×18席 にしたが、奥行きが横幅の1.4倍と
-- 「縦に細長い長方形」の不自然なレイアウトになっていた。
--
-- 実態調査の結果、TOHOシネマズの中規模スクリーン(~250席)は:
--   - 10〜12列 × 18〜25席
--   - 横幅 > 奥行きの横長レイアウト
--
-- 10列×25席=250席に再構成。
--
-- 変更:
-- - 列数: 14 → 10 (A〜J)
-- - 席数/列: 18 → 25
-- - 総席数: 252 → 250
-- - 部屋幅: 22m (維持)
-- - 部屋奥行: 21 → 17m
-- - スクリーン幅: 18m、高さ 7.5m (維持)
-- - screen_center_z: 10.5 → 8.5
--
-- 寸法:
-- - 席エリア幅: 24 × 0.6m = 14.4m (席1=-7.2、席25=+7.2)
-- - 席エリア奥行: 9 × 1.1m = 9.9m (A=3.5、J=-6.4)
-- - 側面歩道: (22 - 14.4)/2 = 3.8m × 2
-- - 前列〜スクリーン: 5m
-- - 後列〜後壁: 2.1m
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_y_values NUMERIC[] := ARRAY[0, 0.2, 0.43, 0.7, 1.03, 1.4, 1.8, 2.23, 2.68, 3.13];
  v_row_idx INTEGER;
  v_seat_num INTEGER;
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  IF v_theater_id IS NULL THEN RETURN; END IF;

  -- 1. 部屋・スクリーン寸法を更新
  UPDATE theaters
  SET room_depth = 17,
      screen_center_z = 8.5,
      description = 'Dolby Atmos 9.1.6 標準配置のサンプル劇場。10列×25席＝250席（横長レイアウト）。'
  WHERE id = v_theater_id;

  -- 2. 既存座席を全削除して再生成 (10列×25席)
  DELETE FROM theater_seats WHERE theater_id = v_theater_id;

  FOR v_row_idx IN 1..10 LOOP
    FOR v_seat_num IN 1..25 LOOP
      INSERT INTO theater_seats (
        theater_id, row_label, seat_number,
        position_x, position_y, position_z, seat_type
      ) VALUES (
        v_theater_id,
        v_row_labels[v_row_idx],
        v_seat_num,
        (v_seat_num - 13) * 0.6, -- 中心13、席1=-7.2、席25=+7.2
        v_y_values[v_row_idx],
        3.5 - (v_row_idx - 1) * 1.1, -- A=3.5、J=-6.4
        'standard'
      );
    END LOOP;
  END LOOP;

  -- 3. スピーカー位置を新しい部屋寸法に合わせて更新
  -- 前方系: 新スクリーン(z=8.5)に追従
  UPDATE theater_speakers SET position_z = 8
    WHERE theater_id = v_theater_id AND channel IN ('L', 'R');
  UPDATE theater_speakers SET position_z = 8.5
    WHERE theater_id = v_theater_id AND channel = 'C';
  UPDATE theater_speakers SET position_z = 8
    WHERE theater_id = v_theater_id AND channel = 'LFE';
  -- 側面サラウンド: 客席エリア中央 z=-1.5
  UPDATE theater_speakers SET position_z = -1.5
    WHERE theater_id = v_theater_id AND channel IN ('LSS', 'RSS');
  -- ワイド: A列付近 z=3.5
  UPDATE theater_speakers SET position_z = 3.5
    WHERE theater_id = v_theater_id AND channel IN ('LSW', 'RSW');
  -- 背面サラウンド: 新後壁 -8.5 の前方 0.5m
  UPDATE theater_speakers SET position_z = -8
    WHERE theater_id = v_theater_id AND channel IN ('LBS', 'RBS');
  -- 天井前: A列上空
  UPDATE theater_speakers SET position_z = 3.5
    WHERE theater_id = v_theater_id AND channel IN ('LTF', 'RTF');
  -- 天井中: 客席中央上空
  UPDATE theater_speakers SET position_z = -1.5
    WHERE theater_id = v_theater_id AND channel IN ('LTM', 'RTM');
  -- 天井後: J列上空
  UPDATE theater_speakers SET position_z = -6
    WHERE theater_id = v_theater_id AND channel IN ('LTR', 'RTR');
END $$;
