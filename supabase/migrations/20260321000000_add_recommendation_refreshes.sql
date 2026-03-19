-- recommendation_refreshes テーブル作成
-- レコメンド手動更新の月間回数制限を管理

CREATE TABLE recommendation_refreshes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス（ユーザーごとの当月レコード数カウント用）
CREATE INDEX idx_recommendation_refreshes_user_created
  ON recommendation_refreshes (user_id, created_at);

-- RLS有効化
ALTER TABLE recommendation_refreshes ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: SELECT/INSERT は自分のレコードのみ
CREATE POLICY "recommendation_refreshes_select_own"
  ON recommendation_refreshes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "recommendation_refreshes_insert_own"
  ON recommendation_refreshes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
