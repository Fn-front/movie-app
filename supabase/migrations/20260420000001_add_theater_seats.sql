-- ============================================
-- theater_seats（劇場座席）テーブル追加
-- ============================================

-- --------------------------------------------
-- テーブル作成
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS theater_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  row_label VARCHAR(4) NOT NULL,
  seat_number INTEGER NOT NULL,
  position_x NUMERIC(6,2) NOT NULL,
  position_z NUMERIC(6,2) NOT NULL,
  position_y NUMERIC(6,2) NOT NULL,
  seat_type VARCHAR(30) NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_theater_seats_entry UNIQUE (theater_id, row_label, seat_number)
);

-- --------------------------------------------
-- インデックス
-- --------------------------------------------
CREATE INDEX idx_theater_seats_theater_id ON theater_seats (theater_id);

-- --------------------------------------------
-- Row Level Security
-- --------------------------------------------
ALTER TABLE theater_seats ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可能
-- 親テーブル theaters の is_active / deleted_at フィルタは API Route 側で担保
CREATE POLICY "theater_seats_select_public" ON theater_seats
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: service_role のみ（ポリシー未定義で拒否）
