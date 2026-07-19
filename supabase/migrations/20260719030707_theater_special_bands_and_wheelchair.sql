-- ============================================
-- Migration: 特別席帯（台形）＋車椅子席
-- ============================================
--
-- 調査(実在館の座席表)より、日本の映画館は列を直線に並べつつ、
--   - 前列/後方の「特別席帯」(プレミアム前列・後方ラグジュアリー等)は
--     通常列より席数が少なく、平面が台形状になる
--   - 車椅子席は通路脇・出入口/横通路付近に配置される
-- という特徴がある。これらを反映する。
--
-- 実装（20260719022150 の等間隔＋通路配置を土台に、端席の削除と seat_type 更新のみ）:
--   1. 台形: 特別席帯の列の端席を削除（残る席は元のX＝列揃えのまま中央寄り＝台形）
--        - Dolby A列(プレミアム前列): 中央10席(seat 6..15)のみ
--        - TCX A列(プレミアボックス): 中央24席(seat 4..27) / O・P列(後方ラグジュアリー): 中央22席(seat 5..26)
--        - standard / imax: 変更なし（実在も中規模〜IMAXは列ごとの席数がおおむね一定）
--   2. 車椅子席: 通路脇の2席を seat_type='wheelchair' に更新
--        - standard=A列5/12番 / imax=I列10/26番 / dolby=M列6/15番 / tcx=I列9/23番
--   3. 台形反映後の総席数に合わせて description を更新（Dolby 260→250, TCX 480→458）
-- ============================================

DO $$
DECLARE
  v_std UUID;
  v_imax UUID;
  v_dolby UUID;
  v_tcx UUID;
BEGIN
  SELECT id INTO v_std   FROM theaters WHERE slug = 'standard-medium';
  SELECT id INTO v_imax  FROM theaters WHERE slug = 'imax-gt';
  SELECT id INTO v_dolby FROM theaters WHERE slug = 'dolby-cinema';
  SELECT id INTO v_tcx   FROM theaters WHERE slug = 'tcx';

  -- 1. 台形（特別席帯の端席を削除）
  IF v_dolby IS NOT NULL THEN
    -- Dolby A列: 中央10席(6..15)のみ残す
    DELETE FROM theater_seats
    WHERE theater_id = v_dolby AND row_label = 'A'
      AND (seat_number <= 5 OR seat_number >= 16);
  END IF;

  IF v_tcx IS NOT NULL THEN
    -- TCX A列(プレミアボックス): 中央24席(4..27)
    DELETE FROM theater_seats
    WHERE theater_id = v_tcx AND row_label = 'A'
      AND (seat_number <= 3 OR seat_number >= 28);
    -- TCX O・P列(後方ラグジュアリー): 中央22席(5..26)
    DELETE FROM theater_seats
    WHERE theater_id = v_tcx AND row_label IN ('O', 'P')
      AND (seat_number <= 4 OR seat_number >= 27);
  END IF;

  -- 2. 車椅子席（通路脇の2席）
  IF v_std IS NOT NULL THEN
    UPDATE theater_seats SET seat_type = 'wheelchair'
    WHERE theater_id = v_std AND row_label = 'A' AND seat_number IN (5, 12);
  END IF;
  IF v_imax IS NOT NULL THEN
    UPDATE theater_seats SET seat_type = 'wheelchair'
    WHERE theater_id = v_imax AND row_label = 'I' AND seat_number IN (10, 26);
  END IF;
  IF v_dolby IS NOT NULL THEN
    UPDATE theater_seats SET seat_type = 'wheelchair'
    WHERE theater_id = v_dolby AND row_label = 'M' AND seat_number IN (6, 15);
  END IF;
  IF v_tcx IS NOT NULL THEN
    UPDATE theater_seats SET seat_type = 'wheelchair'
    WHERE theater_id = v_tcx AND row_label = 'I' AND seat_number IN (9, 23);
  END IF;

  -- 3. description を台形反映後の席数に更新
  UPDATE theaters
  SET description = '丸の内ピカデリーDolby Cinemaを参考。15m×7.13m、13列。A列は中央10席のプレミアム前列、以降各20席＝計250席（実在の255席規模）。ゆとり設計で傾斜は緩やか。ネイティブDolby Atmos+Dolby Vision。'
  WHERE id = v_dolby;

  UPDATE theaters
  SET description = 'TOHOシネマズ新宿スクリーン9を参考にしたTCX大型スクリーン。19m×8mの横長、16列。前列プレミアボックス(24席)・後方ラグジュアリー2列(各22席)を絞り計458席（実在の483席規模）。実態はTCX規格（format enum未定義のためstandardで表現）。'
  WHERE id = v_tcx;
END $$;
