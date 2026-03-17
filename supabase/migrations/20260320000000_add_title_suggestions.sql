-- title_suggestions テーブル作成
-- 邦題→原題のAI翻訳結果をキャッシュするテーブル
-- 全ユーザー共有のキャッシュ（認証不要）

CREATE TABLE title_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_title VARCHAR(255) NOT NULL,
  suggestions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_title_suggestions_query UNIQUE (query_title)
);

-- RLS有効化
ALTER TABLE title_suggestions ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザーが参照可能
CREATE POLICY "title_suggestions_select_all"
  ON title_suggestions FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: service_role のみ（API経由）
