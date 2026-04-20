-- ============================================
-- theaters（劇場）テーブル追加
-- ============================================

-- --------------------------------------------
-- テーブル作成
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS theaters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  format VARCHAR(50) NOT NULL,
  room_width NUMERIC(6,2) NOT NULL,
  room_depth NUMERIC(6,2) NOT NULL,
  room_height NUMERIC(6,2) NOT NULL,
  screen_width NUMERIC(6,2) NOT NULL,
  screen_height NUMERIC(6,2) NOT NULL,
  screen_center_x NUMERIC(6,2) NOT NULL,
  screen_center_y NUMERIC(6,2) NOT NULL,
  screen_center_z NUMERIC(6,2) NOT NULL,
  audio_layout VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- --------------------------------------------
-- インデックス
-- --------------------------------------------
CREATE UNIQUE INDEX idx_theaters_slug ON theaters (slug);

-- --------------------------------------------
-- Row Level Security
-- --------------------------------------------
ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;

-- SELECT: アクティブかつ未削除のレコードのみ閲覧可能
CREATE POLICY "theaters_select_public" ON theaters
  FOR SELECT USING (deleted_at IS NULL AND is_active = true);

-- INSERT/UPDATE/DELETE: service_role のみ（ポリシー未定義で拒否）

-- --------------------------------------------
-- updated_at トリガー（既存関数を再利用）
-- --------------------------------------------
CREATE TRIGGER set_theaters_updated_at
  BEFORE UPDATE ON theaters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
