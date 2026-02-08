-- saved_filtersテーブル作成（ユーザーごとのフィルター条件保存）
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filter_conditions JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT saved_filters_user_id_unique UNIQUE (user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON saved_filters(user_id);

-- 更新日時自動更新トリガー
CREATE TRIGGER update_saved_filters_updated_at
  BEFORE UPDATE ON saved_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS有効化
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY saved_filters_select_own ON saved_filters
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY saved_filters_insert_own ON saved_filters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY saved_filters_update_own ON saved_filters
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY saved_filters_delete_own ON saved_filters
  FOR DELETE
  USING (auth.uid() = user_id);
