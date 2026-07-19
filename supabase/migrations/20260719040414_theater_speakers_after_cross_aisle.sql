-- ============================================
-- Migration: 横通路の座席Zシフトに合わせてスピーカーを再生成
-- ============================================
--
-- 20260719015039 はスピーカー位置と全チャンネルの向きを、座席レイアウト由来の
-- v_last(最後列Z) と v_mid(客席中央Z=(front+last)/2) から算出していた。
-- しかし 20260719025501(横通路) が最後列を含む後方列を 1.0m 後退させたため、
-- 後方/天井後方スピーカー(LBS/RBS/LTR/RTR)や向きの基準点(v_mid)が実座席配置から
-- ずれて陳腐化していた（音響ヒートマップ・スピーカー可視化が実配置と不整合）。
--
-- 本マイグレーションで、横通路後退を織り込んだ v_last / v_mid を用いて
-- 全4タイプのスピーカーを再生成する（位置・向き・パワー・指向性は 015039 と同方式）。
-- v_last = front_z - (nrows-1)*row_pitch - cross_gap(1.0)
-- ============================================

DO $$
DECLARE
  cfg RECORD;
  v_theater_id UUID;
  v_sw NUMERIC;
  v_scy NUMERIC;
  v_scz NUMERIC;
  v_h NUMERIC;
  v_w2 NUMERIC;
  v_front NUMERIC;
  v_last NUMERIC;
  v_mid NUMERIC;
  v_bsz NUMERIC;
  v_ceil NUMERIC;
  v_cross_gap CONSTANT NUMERIC := 1.0;
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('standard-medium', 12,   4.35, 10.5, 8.5, 14.5, 6.0, 21, 14, 1.1),
      ('imax-gt',         25.8, 10.45, 13,  21,  29,   7.0, 26, 16, 1.15),
      ('dolby-cinema',    15,   4.8,  10.5, 9.5, 18,   6.0, 21, 13, 1.2),
      ('tcx',             19,   5,    12.5, 11,  22,   7.5, 25, 16, 1.15)
    ) AS t(
      slug, screen_w, screen_cy, screen_cz, room_h, room_w,
      front_z, room_d, nrows, row_pitch
    )
  LOOP
    SELECT id INTO v_theater_id FROM theaters WHERE slug = cfg.slug;
    IF v_theater_id IS NULL THEN
      CONTINUE;
    END IF;

    v_sw := cfg.screen_w;
    v_scy := cfg.screen_cy;
    v_scz := cfg.screen_cz;
    v_h := cfg.room_h;
    -- room_w/room_d は整数列のため ::numeric を明示（整数除算による誤差を防ぐ）
    v_w2 := cfg.room_w::numeric / 2;
    v_front := cfg.front_z;
    -- 横通路(20260719025501)で最後列が cross_gap 後退した実配置に合わせる
    v_last := cfg.front_z - (cfg.nrows - 1) * cfg.row_pitch - v_cross_gap;
    v_mid := (v_front + v_last) / 2;
    v_bsz := GREATEST(v_last - 0.5, -cfg.room_d::numeric / 2 + 0.3);
    v_ceil := v_h - 0.4;

    DELETE FROM theater_speakers WHERE theater_id = v_theater_id;
    INSERT INTO theater_speakers (
      theater_id, channel, position_x, position_y, position_z, power_watts,
      direction_x, direction_y, direction_z, directivity_alpha
    )
    SELECT
      v_theater_id, sp.channel,
      round(sp.px, 2), round(sp.py, 2), round(sp.pz, 2), sp.pw,
      round(((0 - sp.px) / sp.len)::numeric, 4),
      round(((1.0 - sp.py) / sp.len)::numeric, 4),
      round(((v_mid - sp.pz) / sp.len)::numeric, 4),
      sp.alpha
    FROM (
      SELECT channel, px, py, pz, pw, alpha,
        sqrt(power(0 - px, 2) + power(1.0 - py, 2) + power(v_mid - pz, 2)) AS len
      FROM (VALUES
        ('L',   (-v_sw * 0.45),  v_scy,          (v_scz - 0.3), 500::numeric, 0.5::numeric),
        ('R',   ( v_sw * 0.45),  v_scy,          (v_scz - 0.3), 500,          0.5),
        ('C',   0::numeric,      (v_scy - 0.5),  (v_scz - 0.2), 600,          0.5),
        ('LFE', 0,               0.6,            (v_scz - 0.3), 800,          1.0),
        ('LSS', (-(v_w2 - 0.3)), (v_h * 0.42),   v_mid,         400,          0.5),
        ('RSS', ( (v_w2 - 0.3)), (v_h * 0.42),   v_mid,         400,          0.5),
        ('LSW', (-(v_w2 - 0.5)), (v_h * 0.42),   v_front,       400,          0.5),
        ('RSW', ( (v_w2 - 0.5)), (v_h * 0.42),   v_front,       400,          0.5),
        ('LBS', (-(v_w2 - 1.5)), (v_h * 0.42),   v_bsz,         30,           0.2),
        ('RBS', ( (v_w2 - 1.5)), (v_h * 0.42),   v_bsz,         30,           0.2),
        ('LTF', (-v_sw * 0.22),  v_ceil,         v_front,       300,          0.6),
        ('RTF', ( v_sw * 0.22),  v_ceil,         v_front,       300,          0.6),
        ('LTM', (-v_w2 * 0.44),  v_ceil,         v_mid,         300,          0.6),
        ('RTM', ( v_w2 * 0.44),  v_ceil,         v_mid,         300,          0.6),
        ('LTR', (-v_w2 * 0.44),  v_ceil,         v_last,        300,          0.6),
        ('RTR', ( v_w2 * 0.44),  v_ceil,         v_last,        300,          0.6)
      ) AS raw(channel, px, py, pz, pw, alpha)
    ) sp;

  END LOOP;
END $$;
