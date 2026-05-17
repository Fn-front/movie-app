-- ============================================
-- Migration: スピーカー配置を Dolby Atmos 9.1.6 標準に近づける
-- ============================================
--
-- 既存配置のズレ:
-- 1. L/R が x=±6 にあり、スクリーン(幅16m)の端(±8)から内側に2m偏っていた
-- 2. LSW/RSW (ワイド) が x=±8 にあったが、Atmos仕様では側壁(±10)に
-- 3. LBS/RBS (バックサラウンド) が z=-7 = J列と同位置だった
--    → J列より後方 (z=-10付近) の壁付近に
-- 4. LTR/RTR (天井後) が z=-6 (J列の手前) だった → J列上 (z=-8)
--
-- standard-medium シアター (slug='standard-medium') 対象。
-- room_width=20, room_depth=25, room_height=8, screen_width=16
-- A列 z=7.5, J列 z=-7, 側壁 x=±10, 後壁 z=-12.5
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  IF v_theater_id IS NULL THEN
    RAISE NOTICE 'standard-medium シアターが見つからないためスキップ';
    RETURN;
  END IF;

  -- 1. L/R をスクリーン端寄りに (±6 → ±7)
  UPDATE theater_speakers SET position_x = -7
    WHERE theater_id = v_theater_id AND channel = 'L';
  UPDATE theater_speakers SET position_x = 7
    WHERE theater_id = v_theater_id AND channel = 'R';

  -- 2. LSW/RSW を側壁へ (x=±8 → ±10, y=3.5 → 4)
  UPDATE theater_speakers SET position_x = -10, position_y = 4
    WHERE theater_id = v_theater_id AND channel = 'LSW';
  UPDATE theater_speakers SET position_x = 10, position_y = 4
    WHERE theater_id = v_theater_id AND channel = 'RSW';

  -- 3. LBS/RBS を後壁寄りに (z=-7 → -10)
  UPDATE theater_speakers SET position_z = -10
    WHERE theater_id = v_theater_id AND channel = 'LBS';
  UPDATE theater_speakers SET position_z = -10
    WHERE theater_id = v_theater_id AND channel = 'RBS';

  -- 4. LTR/RTR を J列上に (z=-6 → -8)
  UPDATE theater_speakers SET position_z = -8
    WHERE theater_id = v_theater_id AND channel = 'LTR';
  UPDATE theater_speakers SET position_z = -8
    WHERE theater_id = v_theater_id AND channel = 'RTR';
END $$;
