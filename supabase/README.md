# Supabase データベースセットアップ

## 📋 実行手順

### 1. Supabase SQL Editor を開く

1. [Supabase Dashboard](https://supabase.com/dashboard) にアクセス
2. プロジェクトを選択
3. 左サイドバーの **SQL Editor** をクリック

### 2. スキーマSQLを実行

1. SQL Editorで **+ New query** をクリック
2. `supabase/schema.sql` ファイルの内容を全てコピー
3. SQL Editorにペースト
4. **Run** ボタンをクリック（または Cmd/Ctrl + Enter）
5. 実行完了を待つ（数秒）

### 3. 実行結果の確認

以下のメッセージが表示されれば成功です：

```
✅ データベーススキーマの作成が完了しました！

作成されたテーブル:
  - users
  - otp_tokens
  - password_reset_tokens
  - watchlist
  - movie_cache
  - rate_limits
  - user_preferences
  - reviews
```

### 4. テーブル作成の確認

1. 左サイドバーの **Table Editor** をクリック
2. 以下のテーブルが表示されることを確認：
   - users
   - otp_tokens
   - password_reset_tokens
   - watchlist
   - movie_cache
   - rate_limits
   - user_preferences
   - reviews

### 5. Authentication設定（オプション）

NextAuth.jsと統合する場合、Supabase Authenticationは使用しません。
代わりに `users` テーブルで独自の認証管理を行います。

## 🔒 Row Level Security (RLS)

すべてのテーブルで RLS が有効化されており、以下のアクセス制御が適用されています：

### ユーザーデータ
- **users**: 自分のレコードのみアクセス可能（新規登録は公開）
- **otp_tokens**: 自分のトークンのみアクセス可能（発行は公開）
- **password_reset_tokens**: 自分のトークンのみアクセス可能（発行は公開）
- **watchlist**: 自分のリストのみアクセス可能
- **user_preferences**: 自分の設定のみアクセス可能

### 公開データ
- **movie_cache**: 全員閲覧可能（更新はサービスロールのみ）
- **reviews**: 全員閲覧可能（追加・更新・削除は自分のみ）

### レート制限
- **rate_limits**: 全員アクセス可能（レート制限チェック用）

## 📝 スキーマ詳細

詳細なテーブル定義は `.claude/documents/database-schema.md` を参照してください。

### 主要テーブル

| テーブル名 | 説明 | 削除方式 |
|-----------|------|---------|
| users | ユーザーアカウント | 物理削除 |
| otp_tokens | OTP認証トークン | 物理削除（認証完了後） |
| password_reset_tokens | パスワードリセット | 物理削除（リセット完了後） |
| watchlist | 見たい映画リスト | 論理削除 |
| movie_cache | 映画情報キャッシュ | 物理削除 |
| rate_limits | レート制限管理 | 物理削除（期限切れ後） |
| user_preferences | ユーザー設定 | 物理削除 |
| reviews | レビュー・評価 | 物理削除 |

## 🔧 トラブルシューティング

### エラー: "extension "uuid-ossp" does not exist"

Supabaseでは通常 `uuid-ossp` が有効化されていますが、エラーが出る場合：

1. SQL Editorで以下を実行：
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### エラー: "relation already exists"

テーブルが既に存在する場合は、以下のどちらかを実行：

**A. 既存テーブルを削除して再作成（データ全削除）**
```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

その後、`schema.sql` を再実行。

**B. 個別テーブルを削除**
```sql
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS movie_cache CASCADE;
DROP TABLE IF EXISTS watchlist CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS otp_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

その後、`schema.sql` を再実行。

## ✅ 次のステップ

1. ✅ データベーススキーマ作成完了
2. ⏭️ NextAuth.js v5 設定
3. ⏭️ API Route実装
4. ⏭️ 認証フロー実装
