-- Fix: migration 20260421030409 が全スピーカーの direction_x を一律反転したが、
-- 左右対称ペアでは「内向き」が正しい。
-- LBS/RBS は migration 20260421093248 で修正済み。
-- C/LFE は direction_x = 0 なので影響なし。
-- 残り10本（L/R/LSS/RSS/LSW/RSW/LTF/RTF/LTM/RTM/LTR/RTR）の direction_x を再反転して正しい向きに戻す。

UPDATE theater_speakers
SET direction_x = -direction_x
WHERE channel IN (
  'L', 'R',
  'LSS', 'RSS',
  'LSW', 'RSW',
  'LTF', 'RTF',
  'LTM', 'RTM',
  'LTR', 'RTR'
);
