-- ============================================
-- theater_speakers（劇場スピーカー）テーブル追加
-- ============================================

-- --------------------------------------------
-- テーブル作成
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS theater_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  position_x NUMERIC(6,2) NOT NULL,
  position_y NUMERIC(6,2) NOT NULL,
  position_z NUMERIC(6,2) NOT NULL,
  power_watts NUMERIC(6,1) NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------
-- インデックス
-- --------------------------------------------
CREATE INDEX idx_theater_speakers_theater_id ON theater_speakers (theater_id);

-- --------------------------------------------
-- Row Level Security
-- --------------------------------------------
ALTER TABLE theater_speakers ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可能
-- 親テーブル theaters の is_active / deleted_at フィルタは API Route 側で担保
CREATE POLICY "theater_speakers_select_public" ON theater_speakers
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: service_role のみ（ポリシー未定義で拒否）
