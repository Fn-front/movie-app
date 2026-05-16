-- ============================================
-- Migration: 部屋の奥行きを縮めJ列後方の無駄空間を解消
-- ============================================
--
-- 現状:
-- - 部屋奥行 25m、screen_center_z=12.5、A列 z=7.5、J列 z=-2.4
-- - 後壁 z=-12.5、J列〜後壁の距離 10.1m → 過剰
-- - LBS/RBS や LTR/RTR が客席から遠く離れた位置に
--
-- 修正方針: 全体を z 軸 -4m シフトし、部屋を 17m に縮小
-- - 前列〜スクリーン: 5m を維持
-- - 後列〜後壁: ~2m に短縮（実映画館の歩道幅相当）
--
-- 変更後:
-- - room_depth: 25 → 17 (halfDepth: 12.5 → 8.5)
-- - screen_center_z: 12.5 → 8.5
-- - 座席 z: -4 シフト（A列 7.5→3.5、J列 -2.4→-6.4）
-- - スピーカー z: -4 シフト、ただし背面スピーカーは新後壁に追従
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

  -- 1. theaters: 部屋奥行きとスクリーンZを更新
  UPDATE theaters
  SET room_depth = 17,
      screen_center_z = 8.5
  WHERE id = v_theater_id;

  -- 2. 座席 position_z を -4 シフト
  UPDATE theater_seats
  SET position_z = position_z - 4
  WHERE theater_id = v_theater_id;

  -- 3. スピーカー position_z を -4 シフト（一律）
  UPDATE theater_speakers
  SET position_z = position_z - 4
  WHERE theater_id = v_theater_id;

  -- 4. 背面スピーカーを新しい後壁(z=-8.5)に追従させる
  --    LBS/RBS: 後壁から 0.5m 前方 → z=-8
  UPDATE theater_speakers SET position_z = -8
    WHERE theater_id = v_theater_id AND channel IN ('LBS', 'RBS');

  --    LTR/RTR (天井後): 新J列(z=-6.4)の少し後方 → z=-7
  UPDATE theater_speakers SET position_z = -7
    WHERE theater_id = v_theater_id AND channel IN ('LTR', 'RTR');
END $$;
