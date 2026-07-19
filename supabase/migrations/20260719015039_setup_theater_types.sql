-- ============================================
-- Migration: 映画館タイプを実在スペックに合わせて整備
-- ============================================
--
-- シアター体験を、実在する日本の映画館タイプごとに切り替えられるよう、
-- 4タイプ分の劇場データを整備する。
--   1. standard-medium … 既存を現実的な席数へ再構成（横25席/列の非現実的レイアウトを是正）
--   2. imax-gt          … 新規（IMAXレーザー/GTテクノロジー）
--   3. dolby-cinema     … 新規（Dolby Cinema）
--   4. tcx              … 新規（TOHO Cinemas TCX 大型スクリーン）
--
-- 数値根拠（スクリーン寸法・総席数は一次情報で確認済み）:
--   - standard : イオンシネマ大高 スクリーン8 (12.0m×6.7m / 231席)
--   - imax-gt  : グランドシネマサンシャイン池袋 シアター12 (25.8m×18.9m / 544席)
--   - dolby    : 丸の内ピカデリー Dolby Cinema (15m×7.13m / 255席)
--   - tcx      : TOHOシネマズ新宿 スクリーン9 (19.0m×8.0m / 483席)
-- 客室寸法・列/席レイアウト・傾斜・座席/スピーカーピッチは各館非公表のため、
-- 確定値と下記の座標系ポリシーから導いた整合値。
--
-- 座標系ポリシー:
--   原点=客席フロア中心、Y=0=床、+X=右、+Z=スクリーン側（前方）
--   スクリーンは前方壁面 z=+room_depth/2（=screen_center_z）に一致
--   座席X=中央0対称、Z=最前列(front_z)から後方へ減少、Y=スタジアム傾斜（前緩・後急）
--
-- 注記:
--   - TCXは format enum(standard/imax/dolby_cinema) に無いため format='standard' とし、
--     実態は name/description に明記
--   - 音響は全タイプ共通で 16ch Dolby Atmos 9.1.6 配置(atmos_9_1_6)を流用して可視化。
--     スピーカーの向きは normalize(客席中央(0,1.0,mid_z) - 設置位置) で室内寸法に追従
--   - IMAXの実列は I/L 欠番だが、可視化では連番(A..)で表現
-- ============================================

DO $$
DECLARE
  cfg RECORD;
  v_theater_id UUID;
  v_row INTEGER;
  v_seat INTEGER;
  v_total_rise NUMERIC;
  -- 派生スカラ（スピーカー配置用）
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
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ('standard-medium', '汎用中規模シアター（標準）', 'standard',
        'イオンシネマ大高スクリーン8(12.0m×6.7m/231席)を参考にした中規模スクリーン。14列×16席＝224席（実在の約230席規模を再現）。Dolby Atmos 9.1.6を可視化。',
        14.5, 21, 8.5,   12, 6.7,     4.35, 10.5,   14, 16,   0.55, 1.1,  6.0, 0.32),
      ('imax-gt', 'IMAXレーザー/GTテクノロジー', 'imax',
        'グランドシネマサンシャイン池袋シアター12を参考にした日本最大級IMAX。25.8m×18.9m、16列×34席＝544席。実音響はIMAX 12ch（可視化はAtmos流用）。',
        29, 26, 21,      25.8, 18.9,   10.45, 13,    16, 34,   0.55, 1.15, 7.0, 0.5),
      ('dolby-cinema', 'Dolby Cinema', 'dolby_cinema',
        '丸の内ピカデリーDolby Cinemaを参考。15m×7.13m、13列×20席＝260席（実在の255席規模）。ゆとり設計で傾斜は緩やか。ネイティブDolby Atmos+Dolby Vision。',
        18, 21, 9.5,     15, 7.13,     4.8, 10.5,    13, 20,   0.6,  1.2,  6.0, 0.22),
      ('tcx', 'TCX 大型スクリーン（TOHOシネマズ）', 'standard',
        'TOHOシネマズ新宿スクリーン9を参考にしたTCX大型スクリーン。19m×8mの横長、16列×30席＝480席（実在の483席規模）。実態はTCX規格（format enum未定義のためstandardで表現）。',
        22, 25, 11,      19, 8,        5, 12.5,      16, 30,   0.58, 1.15, 7.5, 0.4)
    ) AS t(
      slug, name, format, descr,
      room_w, room_d, room_h,  screen_w, screen_h,  screen_cy, screen_cz,
      nrows, nseats,  seat_sp, row_pitch, front_z, slope
    )
  LOOP
    -- 1. 劇場をupsert（既存standard-mediumは再構成、他3件は新規追加）
    INSERT INTO theaters (
      slug, name, format,
      room_width, room_depth, room_height,
      screen_width, screen_height,
      screen_center_x, screen_center_y, screen_center_z,
      audio_layout, description, is_active
    ) VALUES (
      cfg.slug, cfg.name, cfg.format,
      cfg.room_w, cfg.room_d, cfg.room_h,
      cfg.screen_w, cfg.screen_h,
      0, cfg.screen_cy, cfg.screen_cz,
      'atmos_9_1_6', cfg.descr, true
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      format = EXCLUDED.format,
      room_width = EXCLUDED.room_width,
      room_depth = EXCLUDED.room_depth,
      room_height = EXCLUDED.room_height,
      screen_width = EXCLUDED.screen_width,
      screen_height = EXCLUDED.screen_height,
      screen_center_x = EXCLUDED.screen_center_x,
      screen_center_y = EXCLUDED.screen_center_y,
      screen_center_z = EXCLUDED.screen_center_z,
      audio_layout = EXCLUDED.audio_layout,
      description = EXCLUDED.description,
      is_active = true,
      deleted_at = NULL
    RETURNING id INTO v_theater_id;

    -- 2. 座席を再生成（前緩・後急のスタジアム傾斜: y = total_rise * t^1.3）
    DELETE FROM theater_seats WHERE theater_id = v_theater_id;
    v_total_rise := (cfg.nrows - 1) * cfg.slope;
    FOR v_row IN 1..cfg.nrows::int LOOP
      FOR v_seat IN 1..cfg.nseats::int LOOP
        INSERT INTO theater_seats (
          theater_id, row_label, seat_number,
          position_x, position_y, position_z, seat_type
        ) VALUES (
          v_theater_id,
          chr(64 + v_row),
          v_seat,
          round(((v_seat - (cfg.nseats + 1) / 2.0) * cfg.seat_sp)::numeric, 2),
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

    -- 3. スピーカーを再生成（16ch Dolby Atmos 9.1.6。位置は室内寸法から算出し、
    --    向きは normalize(客席中央(0, 1.0, mid_z) - 設置位置) で全室に追従）
    v_sw := cfg.screen_w;
    v_scy := cfg.screen_cy;
    v_scz := cfg.screen_cz;
    v_h := cfg.room_h;
    v_w2 := cfg.room_w / 2;
    v_front := cfg.front_z;
    v_last := cfg.front_z - (cfg.nrows - 1) * cfg.row_pitch;
    v_mid := (v_front + v_last) / 2;
    v_bsz := GREATEST(v_last - 0.5, -cfg.room_d / 2 + 0.3);
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
