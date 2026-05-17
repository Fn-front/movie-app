-- direction_x の符号修正
-- 全スピーカーのX成分が反転していたため、客席中央でなく外側を向いていた
UPDATE theater_speakers SET direction_x = -direction_x;
