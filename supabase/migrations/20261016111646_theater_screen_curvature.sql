-- Migration: スクリーンの湾曲（カーブドスクリーン）に対応する
--
-- IMAX公式のシアター構成図は「IMAXスクリーン＝湾曲」「従来のスクリーン＝平面」として
-- 明示的に描き分けている。一方 Dolby Cinema の公式内観、TOHOシネマズ日比谷のTCXの
-- 写真では幕の上辺・側辺とも直線で、湾曲は確認できない。
--
-- そのため湾曲は IMAX のみに適用する。他の劇場は従来どおり平面のままで、視野占有率・
-- 歪みプレビューの計算も既存の平面パスを通る（挙動が一切変わらない）。
--
-- 湾曲の向き:
--   実機の映画館スクリーンは客席側へ凹（客席を包む向き）。弧の中心を客席側
--   (center_x, center_z - R) に置き、幕上の横方向オフセット u に対し
--     θ = u / R
--     x = center_x + R * sin(θ)
--     z = center_z - R * (1 - cos(θ))
--   となる。両端ほど z が小さくなる＝客席に近づく。

ALTER TABLE theaters
  ADD COLUMN IF NOT EXISTS screen_curvature NUMERIC(6,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN theaters.screen_curvature IS
  'スクリーンの湾曲半径(m)。0 なら平面。弧の中心は客席側 (center_x, center_z - R)';

-- IMAX のみ湾曲させる。
--
--   半径はスクリーン幅の約1.55倍を目安にした。
--   screen_width は幕の実寸＝弧長として扱うため、サジッタは弦の式ではなく
--     θ = (25.8 / 2) / 40 = 0.3225 rad
--     40 * (1 - cos(θ)) = 約 2.06m
--   となる。スクリーン(z=13)と最前列(z=7.0)の間は6mあるため、2.06m せり出しても
--   最前列に干渉しない。
UPDATE theaters SET screen_curvature = 40 WHERE slug = 'imax-gt';
