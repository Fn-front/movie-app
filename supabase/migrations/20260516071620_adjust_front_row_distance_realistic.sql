-- ============================================
-- Migration: 最前列〜スクリーン距離をTOHOシネマズ等の実態に近づける
-- ============================================
--
-- 前回（20260516065600）で 9.6m に設定したが、学術的な快適最小値で
-- 実際の映画館（TOHOシネマズ等）よりかなり離れている。
--
-- 実際の運用:
--   - シネマリス設計指針: スクリーン幅 × 0.5 以上（14m超で7m以上）
--   - TOHOシネマズの最前列: 「首が疲れる」「字幕が読みにくい」と
--     言われる程度に近い（実態は 0.3〜0.4 × 幅）
--
-- スクリーン幅 16m に対し A列を z=7.5m（≒5m手前）に再配置:
--   - 距離 5m = スクリーン幅 × 0.31（TOHO最前列クラスの没入感）
--   - シネマリス推奨の最低 7m よりやや近く、「最前列は迫力重視で
--     快適性は犠牲」というTOHO的設計を再現
-- ============================================

DO $$
DECLARE
  v_theater_id UUID;
  v_row_labels TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J'];
  v_row_idx INTEGER;
  v_seat_num INTEGER;
  v_new_z NUMERIC(6, 2);
BEGIN
  SELECT id INTO v_theater_id FROM theaters WHERE slug = 'standard-medium';

  IF v_theater_id IS NULL THEN
    RAISE NOTICE 'standard-medium シアターが見つからないためスキップ';
    RETURN;
  END IF;

  -- A列 z = 7.5m（スクリーン z=12.5 から 5m手前、TOHOクラスの最前列体験）
  -- 列ピッチ 1.1m は前回マイグレーションと同じ
  FOR v_row_idx IN 1..10 LOOP
    v_new_z := 7.5 - (v_row_idx - 1) * 1.1;

    FOR v_seat_num IN 1..15 LOOP
      UPDATE theater_seats
      SET position_z = v_new_z
      WHERE theater_id = v_theater_id
        AND row_label = v_row_labels[v_row_idx]
        AND seat_number = v_seat_num;
    END LOOP;
  END LOOP;
END $$;
