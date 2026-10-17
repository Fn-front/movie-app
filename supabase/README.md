# Supabase データベースセットアップ

> **⚠️ 通常の運用では、このページの手順を使わないこと。**
>
> スキーマ変更は `.claude/rules/supabase-db.md` のとおり、すべてマイグレーションで管理する。
> ダッシュボード（GUI / SQL Editor）での直接変更は禁止。
>
> ```bash
> supabase migration new <name>   # マイグレーション作成
> supabase db push                # リモートDBへ反映
> supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
> ```
>
> 以下は**ゼロからDBを作り直す場合の参考手順**。`schema.sql` はマイグレーション群の
> スナップショットであり、完全に同期している保証はない。新規構築でも
> `supabase db push` でマイグレーションを順に適用するほうが確実。

## 📋 実行手順（新規構築時の参考）

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
  - accounts
  - otp_codes
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
   - accounts
   - otp_codes
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

- **users**: service_role 専用（anon / authenticated の権限は剥奪済み）
- **accounts**: service_role 専用
- **otp_codes**: service_role 専用（ポリシーなし＝全拒否）
- **watchlist**: 自分のリストのみアクセス可能
- **user_preferences**: 自分の設定のみアクセス可能

### 公開データ

- **movie_cache**: 全員閲覧可能（更新はサービスロールのみ）
- **reviews**: 全員閲覧可能（追加・更新・削除は自分のみ）

### レート制限

- **rate_limits**: service_role 専用（ポリシーなし＝全拒否）

## 📝 スキーマ詳細

詳細なテーブル定義は `.claude/documents/database-schema.md` を参照してください。

### 主要テーブル

| テーブル名       | 説明               | 削除方式                   |
| ---------------- | ------------------ | -------------------------- |
| users            | ユーザーアカウント | 物理削除                   |
| accounts         | OAuth連携          | 物理削除（ユーザー削除時） |
| otp_codes        | OTP確認コード      | 物理削除（検証完了後）     |
| watchlist        | 見たい映画リスト   | 論理削除                   |
| movie_cache      | 映画情報キャッシュ | 物理削除                   |
| rate_limits      | レート制限管理     | 物理削除（期限切れ後）     |
| user_preferences | ユーザー設定       | 物理削除                   |
| reviews          | レビュー・評価     | 物理削除                   |

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
-- public ロール（anon を含む全ロール）に CREATE を与えないこと。
-- 必要なのはスキーマの USAGE のみ。
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
```

その後、`schema.sql` を再実行。

**B. 個別テーブルを削除**

```sql
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS movie_cache CASCADE;
DROP TABLE IF EXISTS watchlist CASCADE;
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

その後、`schema.sql` を再実行。

## ✅ 次のステップ

1. ✅ データベーススキーマ作成完了
2. ⏭️ NextAuth.js v5 設定
3. ⏭️ API Route実装
4. ⏭️ 認証フロー実装
