-- ============================================
-- シードデータ: 汎用中規模シアター
-- 劇場1件 + 150席(10列×15) + 16スピーカー(Atmos 9.1.6)
-- ============================================

-- 座標系ポリシー:
--   原点: 客席フロアの中心点（XZ平面）かつ床面の高さ（Y=0）
--   +X = 客席から見て右、+Y = 上、+Z = スクリーン側（後方から前方へ）
--   単位: メートル（m）

-- --------------------------------------------
-- 劇場
-- --------------------------------------------
INSERT INTO theaters (
  name, slug, format,
  room_width, room_depth, room_height,
  screen_width, screen_height,
  screen_center_x, screen_center_y, screen_center_z,
  audio_layout, description
) VALUES (
  '汎用中規模シアター', 'standard-medium', 'standard',
  20.00, 25.00, 8.00,
  14.00, 6.00,
  0.00, 4.00, 12.50,
  'atmos_9_1_6',
  'Dolby Atmos 9.1.6 標準配置のサンプル劇場。10列×15席＝150席。'
);

-- --------------------------------------------
-- 座席（10列 × 15席 = 150席）
-- A列（最前列、スクリーンに近い）〜 J列（最後列、スクリーンから遠い）
-- X座標: -7m（左端）〜 +7m（右端）、1m間隔
-- Z座標: +5m（A列=最前列）〜 -7m（J列=最後列）、1.33m間隔
-- Y座標: 0.0m（A列）〜 0.9m（J列）、0.1m段差/列
-- --------------------------------------------
DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_row_idx INTEGER;
  v_seat_num INTEGER;
  v_x NUMERIC(6,2);
  v_y NUMERIC(6,2);
  v_z NUMERIC(6,2);
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  FOR v_row_idx IN 1..10 LOOP
    FOR v_seat_num IN 1..15 LOOP
      -- X: -7 〜 +7（1m間隔）
      v_x := -7.0 + (v_seat_num - 1) * 1.0;
      -- Z: +5（A列=最前）→ -7（J列=最後）
      v_z := 5.0 - (v_row_idx - 1) * 1.33;
      -- Y: 0.0（A列）→ 0.9（J列）、段差0.1m/列
      v_y := (v_row_idx - 1) * 0.1;

      INSERT INTO theater_seats (
        theater_id, row_label, seat_number,
        position_x, position_z, position_y,
        seat_type
      ) VALUES (
        v_theater_id, v_row_labels[v_row_idx], v_seat_num,
        v_x, v_z, v_y,
        'standard'
      );
    END LOOP;
  END LOOP;
END $$;

-- --------------------------------------------
-- スピーカー（Dolby Atmos 9.1.6 = 16本）
-- --------------------------------------------
DO $$
DECLARE
  v_theater_id UUID;
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  -- フロントL/R（スクリーン両脇）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'L',   -6.00, 4.00, 12.00, 500.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'R',    6.00, 4.00, 12.00, 500.0);

  -- センター（スクリーン中央下）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'C',    0.00, 3.50, 12.50, 500.0);

  -- LFE（サブウーファー、前方下）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LFE', -2.00, 0.50, 12.00, 800.0);

  -- サイドサラウンド（側面中央）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LSS', -10.00, 3.00,  0.00, 400.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'RSS',  10.00, 3.00,  0.00, 400.0);

  -- バックサラウンド（後方）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LBS',  -8.00, 3.00, -7.00, 400.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'RBS',   8.00, 3.00, -7.00, 400.0);

  -- ワイド（前方サイド）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LSW',  -8.00, 3.50,  8.00, 400.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'RSW',   8.00, 3.50,  8.00, 400.0);

  -- トップフロント（天井前方）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LTF',  -4.00, 7.50,  8.00, 300.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'RTF',   4.00, 7.50,  8.00, 300.0);

  -- トップミドル（天井中央）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LTM',  -4.00, 7.50,  0.00, 300.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'RTM',   4.00, 7.50,  0.00, 300.0);

  -- トップリア（天井後方）
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'LTR',  -4.00, 7.50, -6.00, 300.0);
  INSERT INTO theater_speakers (theater_id, channel, position_x, position_y, position_z, power_watts)
  VALUES (v_theater_id, 'RTR',   4.00, 7.50, -6.00, 300.0);
END $$;
