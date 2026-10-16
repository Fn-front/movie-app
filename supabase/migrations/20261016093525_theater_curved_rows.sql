-- Migration: 座席列を弧状（扇形）にする
--
-- 実在の映画館は座席列が弧を描いており、列内のどの席もスクリーンから概ね等距離に
-- なるよう配置されている（視聴距離を揃えるため）。本アプリは直線列だったため、
-- スクリーン中心側に弧の中心を置いた極座標配置へ移行する。
--
-- 配置の考え方:
--   列の中央席は現在位置 (x=0, z=z_r) に据え置き、弧の中心を (0, z_r + R) に取る。
--   席の弧長方向オフセット s（= 現在の position_x）に対し、
--     θ     = s / R
--     new_x = R * sin(θ)
--     new_z = z_r + R * (1 - cos(θ))
--   となる。θ>0 側ほど z が大きくなる（= スクリーンに近づく）ため、列の両端が
--   前方へせり出す実機どおりの弧になる。
--
-- 既存行を UPDATE する（DELETE + 再INSERT にしない）。theater_seats.id を参照する
-- テーブルは無いが、ID を保つ方が安全なため。
--
-- 現在の position_z は列の代表Z（列内で一律）であり、これを弧の基準 z_r として使う。
-- 横通路による z シフト（20260719025501）も既に反映済みなので、その上に弧が乗る。

-- 1. 弧の半径カラムを追加（0 = 直線。将来の劇場追加時に弧なしを選べるようにする）
ALTER TABLE theaters
  ADD COLUMN IF NOT EXISTS row_curve_radius NUMERIC(6,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN theaters.row_curve_radius IS
  '座席列の弧の半径(m)。0 なら直線列。弧の中心は列ごとに (0, 代表Z + R) に取る';

-- 2. 劇場ごとの半径を設定
--
--    室内奥行の約1.4倍を目安にした。これより小さいと弧がきつくなりすぎ、
--    端席の前方せり出しが列間隔を大きく超えてしまう。
--
--    端席の前方シフト = R - sqrt(R^2 - x_end^2)
--      standard-medium: x_end 4.13m / R 29m → 0.29m（列間隔1.10mの約0.27倍）
--      tcx:             x_end 8.41m / R 35m → 1.02m（列間隔1.15mの約0.89倍）
--      imax-gt:         x_end 9.08m / R 36m → 1.16m（列間隔1.15mの約1.01倍）
--      dolby-cinema:    x_end 5.70m / R 29m → 0.57m（列間隔1.20mの約0.47倍）
UPDATE theaters SET row_curve_radius = 29 WHERE slug = 'standard-medium';
UPDATE theaters SET row_curve_radius = 35 WHERE slug = 'tcx';
UPDATE theaters SET row_curve_radius = 36 WHERE slug = 'imax-gt';
UPDATE theaters SET row_curve_radius = 29 WHERE slug = 'dolby-cinema';

-- 3. 座席位置を極座標配置へ更新
--
--    position_x は「弧長方向のオフセット」として解釈する。座席間隔が弧長で一定に
--    なるため、実機の等間隔配置と一致する。
--    row_curve_radius = 0 の劇場は除外し、直線のまま残す。
UPDATE theater_seats s
SET
  position_x = round((t.row_curve_radius * sin(s.position_x / t.row_curve_radius))::numeric, 2),
  position_z = round((
    s.position_z
    + t.row_curve_radius * (1 - cos(s.position_x / t.row_curve_radius))
  )::numeric, 2)
FROM theaters t
WHERE s.theater_id = t.id
  AND t.row_curve_radius > 0;
