-- ============================================
-- Migration: 座席レイアウトを現実的に（通路＋席間隔）
-- ============================================
--
-- 20260719015039 の座席は「隙間の無い完全な格子」で非現実的だった。
--   1. 席間隔が座席メッシュ(クッション幅0.5m)に対して狭く(0.55〜0.58m)、
--      隣接席が密着して各列が塊(バー)状に見えていた。
--   2. 通路が一切なく、全席が1ブロックの格子だった。
--
-- 本マイグレーションで全4タイプの座席を再生成する:
--   - 席間隔を 0.6m 以上に（メッシュ設計値と一致し隣接席に約0.1m以上の隙間）。
--     Dolby はゆとり設計を反映し 0.65m。
--   - 縦通路を2本入れ、各列を「小ブロック｜大ブロック(中央)｜小ブロック」の
--     3ブロックに分割（実在館に近い座席割）。通路幅 0.8m。
--     通路位置は席数の約1/4・3/4（中央ブロックが最大＝プライム席）。
--
-- スタジアム傾斜(前緩・後急, y=total_rise*t^1.3)・列ピッチ・前方ギャップは
-- 20260719015039 と同一。スピーカーは室内寸法依存で不変のため再生成しない。
-- ============================================

DO $$
DECLARE
  cfg RECORD;
  v_theater_id UUID;
  v_row INTEGER;
  v_seat INTEGER;
  v_total_rise NUMERIC;
  v_a1 INTEGER;        -- 1本目の通路（この席番号の後ろ）
  v_a2 INTEGER;        -- 2本目の通路（この席番号の後ろ）
  v_gap CONSTANT NUMERIC := 0.8;  -- 通路幅(m)
  v_total_w NUMERIC;   -- 通路込みの座席エリア全幅
  v_extra NUMERIC;     -- 当該席までに挟まれた通路の累積オフセット
  v_x NUMERIC;
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('standard-medium', 14, 16, 0.6,  1.1,  6.0, 0.32),
      ('imax-gt',         16, 34, 0.6,  1.15, 7.0, 0.5),
      ('dolby-cinema',    13, 20, 0.65, 1.2,  6.0, 0.22),
      ('tcx',             16, 30, 0.6,  1.15, 7.5, 0.4)
    ) AS t(slug, nrows, nseats, seat_sp, row_pitch, front_z, slope)
  LOOP
    SELECT id INTO v_theater_id FROM theaters WHERE slug = cfg.slug;
    IF v_theater_id IS NULL THEN
      CONTINUE;
    END IF;

    -- 通路位置（席数の約1/4・3/4）と全幅
    v_a1 := round(cfg.nseats * 0.25);
    v_a2 := round(cfg.nseats * 0.75);
    v_total_w := (cfg.nseats - 1) * cfg.seat_sp + 2 * v_gap;
    v_total_rise := (cfg.nrows - 1) * cfg.slope;

    DELETE FROM theater_seats WHERE theater_id = v_theater_id;

    FOR v_row IN 1..cfg.nrows::int LOOP
      FOR v_seat IN 1..cfg.nseats::int LOOP
        v_extra := (CASE WHEN v_seat > v_a1 THEN v_gap ELSE 0 END)
                 + (CASE WHEN v_seat > v_a2 THEN v_gap ELSE 0 END);
        -- 通路込みで左右対称に配置（中央 x=0）
        v_x := (v_seat - 1) * cfg.seat_sp + v_extra - v_total_w / 2;

        INSERT INTO theater_seats (
          theater_id, row_label, seat_number,
          position_x, position_y, position_z, seat_type
        ) VALUES (
          v_theater_id,
          chr(64 + v_row),
          v_seat,
          round(v_x::numeric, 2),
          CASE
            WHEN cfg.nrows > 1 THEN round(
              (v_total_rise
                * power((v_row - 1)::numeric / (cfg.nrows - 1), 1.3))::numeric,
              2)
            ELSE 0
          END,
          round((cfg.front_z - (v_row - 1) * cfg.row_pitch)::numeric, 2),
          'standard'
        );
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
