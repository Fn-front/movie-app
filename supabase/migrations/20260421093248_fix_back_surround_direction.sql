-- LBS/RBS バックサラウンドスピーカー調整
-- 問題: 両スピーカーが互いに向き合い、後方中央（座席のないエリア）に音が集中
-- 修正: 客席中央 (0, 1.0, 2) を向くよう方向ベクトルを再計算し、
--       指向性を大幅に狭め(α=0.2)、パワーを低減(30W)
--       実際の映画館でもバックサラウンドは環境音用途で低パワー

-- LBS: (-8,3,-7) → target (0,1,2): vec=(8,-2,9), |v|≈12.21
UPDATE theater_speakers
SET direction_x = 0.66, direction_y = -0.16, direction_z = 0.74,
    directivity_alpha = 0.2, power_watts = 30
WHERE channel = 'LBS';

-- RBS: (8,3,-7) → target (0,1,2): vec=(-8,-2,9), |v|≈12.21
UPDATE theater_speakers
SET direction_x = -0.66, direction_y = -0.16, direction_z = 0.74,
    directivity_alpha = 0.2, power_watts = 30
WHERE channel = 'RBS';
