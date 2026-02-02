---
name: db-schema
description: Create a Supabase table definition with RLS policies
disable-model-invocation: true
argument-hint: <table-name>
---

# Supabaseテーブル定義スキル

このスキルは、プロジェクトのデータベース設計に従ってSupabaseテーブル定義とRLSポリシーを作成します。

## 必須要件

### アーキテクチャ原則

- **Row Level Security (RLS)**: すべてのテーブルで必須
- **UUID主キー**: `gen_random_uuid()`を使用
- **タイムスタンプ**: `created_at`, `updated_at`を必ず含める
- **論理削除**: ユーザーデータは`deleted_at`で論理削除
- **外部キー制約**: 適切な参照整合性を設定

## テーブル定義テンプレート

### 基本構造

```sql
-- ============================================
-- Table: <table_name>
-- Description: <テーブルの説明>
-- ============================================

CREATE TABLE <table_name> (
  -- Primary Key
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Foreign Keys
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Data Fields
  <field_name> <data_type> NOT NULL,
  <field_name> <data_type> NULL,

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP NULL  -- 論理削除用（必要な場合）
);

-- Indexes
CREATE INDEX idx_<table_name>_user_id ON <table_name>(user_id);
CREATE INDEX idx_<table_name>_created_at ON <table_name>(created_at);

-- Updated_at自動更新トリガー
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### updated_at自動更新関数（初回のみ作成）

```sql
-- ============================================
-- Function: update_updated_at_column
-- Description: updated_atを自動更新する共通関数
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Row Level Security (RLS) ポリシー

### RLS有効化

```sql
-- RLSを有効化
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
```

### 標準RLSポリシーパターン

#### パターン1: 自分のデータのみアクセス可能

```sql
-- SELECT: 自分のデータを閲覧
CREATE POLICY "Users can view own data"
  ON <table_name>
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- INSERT: 自分のデータを作成
CREATE POLICY "Users can insert own data"
  ON <table_name>
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 自分のデータを更新
CREATE POLICY "Users can update own data"
  ON <table_name>
  FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: 自分のデータを削除（論理削除の場合はUPDATEポリシーで対応）
CREATE POLICY "Users can delete own data"
  ON <table_name>
  FOR DELETE
  USING (auth.uid() = user_id);
```

#### パターン2: 公開データ（全員閲覧可能、所有者のみ編集）

```sql
-- SELECT: 削除されていないデータは全員閲覧可能
CREATE POLICY "Anyone can view non-deleted data"
  ON <table_name>
  FOR SELECT
  USING (deleted_at IS NULL);

-- INSERT: 認証済みユーザーのみ作成可能
CREATE POLICY "Authenticated users can insert data"
  ON <table_name>
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: 所有者のみ更新可能
CREATE POLICY "Users can update own data"
  ON <table_name>
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: 所有者のみ削除可能
CREATE POLICY "Users can delete own data"
  ON <table_name>
  FOR DELETE
  USING (auth.uid() = user_id);
```

#### パターン3: マスターデータ（読み取り専用）

```sql
-- SELECT: 全員閲覧可能
CREATE POLICY "Anyone can view data"
  ON <table_name>
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: 禁止（管理者のみ直接SQL実行）
```

## データ型ガイドライン

| 用途 | データ型 | 例 |
|------|----------|-----|
| 主キー | `UUID` | `id UUID DEFAULT gen_random_uuid()` |
| 外部キー（ユーザー） | `UUID` | `user_id UUID REFERENCES auth.users(id)` |
| 外部キー（TMDb） | `INTEGER` | `tmdb_id INTEGER NOT NULL` |
| 文字列（短） | `VARCHAR(255)` | `email VARCHAR(255)` |
| 文字列（長） | `TEXT` | `bio TEXT` |
| 数値（整数） | `INTEGER` | `rating INTEGER` |
| 数値（小数） | `DECIMAL(10,2)` | `price DECIMAL(10,2)` |
| 真偽値 | `BOOLEAN` | `is_verified BOOLEAN DEFAULT false` |
| 日時 | `TIMESTAMP` | `created_at TIMESTAMP DEFAULT now()` |
| JSON | `JSONB` | `metadata JSONB` |

## 制約とバリデーション

### NOT NULL制約

```sql
-- 必須フィールドにはNOT NULLを付ける
email VARCHAR(255) NOT NULL,
password_hash VARCHAR(255) NOT NULL,
```

### UNIQUE制約

```sql
-- 一意性が必要なフィールド
email VARCHAR(255) NOT NULL UNIQUE,

-- 複合UNIQUE制約
CONSTRAINT unique_user_tmdb UNIQUE (user_id, tmdb_id)
```

### CHECK制約

```sql
-- 値の範囲チェック
rating INTEGER CHECK (rating >= 1 AND rating <= 5),

-- 文字列パターンチェック
email VARCHAR(255) CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
```

## 論理削除パターン

### ユーザーデータ（watchlist, reviews等）

```sql
-- deleted_atカラムを追加
deleted_at TIMESTAMP NULL,

-- RLSで削除済みデータを除外
CREATE POLICY "Users can view own non-deleted data"
  ON watchlist
  FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- 論理削除の実装（アプリケーション側）
UPDATE watchlist
SET deleted_at = now()
WHERE id = $1 AND user_id = $2;
```

### 認証トークン（OTP, password reset）

```sql
-- 物理削除を使用（deleted_atは不要）
DELETE FROM otp_codes
WHERE id = $1;
```

## マイグレーションファイル構成

```
supabase/migrations/
└── <timestamp>_create_<table_name>.sql
```

### マイグレーションファイル例

```sql
-- ============================================
-- Migration: Create watchlist table
-- Description: ユーザーのウォッチリストを管理するテーブル
-- ============================================

BEGIN;

-- Table Definition
CREATE TABLE watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  added_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP NULL,

  CONSTRAINT unique_user_tmdb UNIQUE (user_id, tmdb_id)
);

-- Indexes
CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX idx_watchlist_tmdb_id ON watchlist(tmdb_id);
CREATE INDEX idx_watchlist_deleted_at ON watchlist(deleted_at);

-- Updated_at Trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON watchlist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own non-deleted watchlist"
  ON watchlist FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can insert own watchlist"
  ON watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist"
  ON watchlist FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- 物理削除は許可しない（論理削除のみ）
-- DELETE policy is not created

COMMIT;
```

## パフォーマンス考慮事項

### インデックス作成

```sql
-- 外部キーには必ずインデックス
CREATE INDEX idx_<table>_<column> ON <table>(<column>);

-- 検索条件に使うカラム
CREATE INDEX idx_<table>_<column> ON <table>(<column>);

-- 複合インデックス（検索条件が複数の場合）
CREATE INDEX idx_<table>_<col1>_<col2> ON <table>(<col1>, <col2>);

-- 部分インデックス（条件付き）
CREATE INDEX idx_<table>_active ON <table>(user_id)
WHERE deleted_at IS NULL;
```

## 参考ドキュメント

- `.claude/documents/database-schema.md` - 全テーブル定義
- `.claude/documents/architecture.md` - データベースアーキテクチャ

## 使用例

```bash
# ウォッチリストテーブルを作成
/db-schema watchlist

# レビューテーブルを作成
/db-schema reviews
```
