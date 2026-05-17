-- スピーカー指向性（Directivity）カラム追加
-- direction_x/y/z: スピーカーの正面方向ベクトル（正規化済み）
-- directivity_alpha: 指向性パラメータ（1.0=全方向均等, 0.5=カーディオイド）

ALTER TABLE theater_speakers
  ADD COLUMN direction_x real NOT NULL DEFAULT 0.0,
  ADD COLUMN direction_y real NOT NULL DEFAULT 0.0,
  ADD COLUMN direction_z real NOT NULL DEFAULT -1.0,
  ADD COLUMN directivity_alpha real NOT NULL DEFAULT 1.0;

-- シードデータ更新: 各スピーカーの向き・alpha・位置/パワー修正
-- ターゲット点 = 客席中央 (0, 1.0, -1.0) への正規化ベクトル

-- L: カーディオイド
UPDATE theater_speakers SET direction_x = 0.41, direction_y = -0.21, direction_z = -0.89, directivity_alpha = 0.5 WHERE channel = 'L';

-- R: カーディオイド
UPDATE theater_speakers SET direction_x = -0.41, direction_y = -0.21, direction_z = -0.89, directivity_alpha = 0.5 WHERE channel = 'R';

-- C: カーディオイド + パワー増加 500→600W
UPDATE theater_speakers SET direction_x = 0.00, direction_y = -0.18, direction_z = -0.98, directivity_alpha = 0.5, power_watts = 600 WHERE channel = 'C';

-- LFE: 全方向均等 + 位置修正（X: -2→0）
UPDATE theater_speakers SET position_x = 0, direction_x = 0.00, direction_y = 0.04, direction_z = -1.00, directivity_alpha = 1.0 WHERE channel = 'LFE';

-- LSS: カーディオイド
UPDATE theater_speakers SET direction_x = 0.98, direction_y = -0.20, direction_z = -0.10, directivity_alpha = 0.5 WHERE channel = 'LSS';

-- RSS: カーディオイド
UPDATE theater_speakers SET direction_x = -0.98, direction_y = -0.20, direction_z = -0.10, directivity_alpha = 0.5 WHERE channel = 'RSS';

-- LBS: 狭い指向性（客席中央向き、低パワー — 環境音用途）
UPDATE theater_speakers SET direction_x = 0.66, direction_y = -0.16, direction_z = 0.74, directivity_alpha = 0.2, power_watts = 30 WHERE channel = 'LBS';

-- RBS: 狭い指向性（客席中央向き、低パワー — 環境音用途）
UPDATE theater_speakers SET direction_x = -0.66, direction_y = -0.16, direction_z = 0.74, directivity_alpha = 0.2, power_watts = 30 WHERE channel = 'RBS';

-- LSW: カーディオイド
UPDATE theater_speakers SET direction_x = 0.65, direction_y = -0.20, direction_z = -0.73, directivity_alpha = 0.5 WHERE channel = 'LSW';

-- RSW: カーディオイド
UPDATE theater_speakers SET direction_x = -0.65, direction_y = -0.20, direction_z = -0.73, directivity_alpha = 0.5 WHERE channel = 'RSW';

-- LTF: やや広いカーディオイド（天井）
UPDATE theater_speakers SET direction_x = 0.34, direction_y = -0.55, direction_z = -0.76, directivity_alpha = 0.6 WHERE channel = 'LTF';

-- RTF: やや広いカーディオイド（天井）
UPDATE theater_speakers SET direction_x = -0.34, direction_y = -0.55, direction_z = -0.76, directivity_alpha = 0.6 WHERE channel = 'RTF';

-- LTM: やや広いカーディオイド（天井）
UPDATE theater_speakers SET direction_x = 0.52, direction_y = -0.84, direction_z = -0.13, directivity_alpha = 0.6 WHERE channel = 'LTM';

-- RTM: やや広いカーディオイド（天井）
UPDATE theater_speakers SET direction_x = -0.52, direction_y = -0.84, direction_z = -0.13, directivity_alpha = 0.6 WHERE channel = 'RTM';

-- LTR: やや広いカーディオイド（天井）
UPDATE theater_speakers SET direction_x = 0.44, direction_y = -0.71, direction_z = 0.55, directivity_alpha = 0.6 WHERE channel = 'LTR';

-- RTR: やや広いカーディオイド（天井）
UPDATE theater_speakers SET direction_x = -0.44, direction_y = -0.71, direction_z = 0.55, directivity_alpha = 0.6 WHERE channel = 'RTR';
