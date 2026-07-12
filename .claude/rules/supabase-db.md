---
description: DB操作（スキーマ変更・マイグレーション・型生成）を行う際のルール
globs:
  - "supabase/**"
  - "src/types/database.types.ts"
  - "**/*.sql"
---

# DB操作ルール（Supabase CLI）

## 【必須】スキーマ変更

- スキーマ変更（テーブル作成・変更・削除、RLS設定等）はすべて `supabase migration new <name>` でマイグレーションファイルを作成して管理する
- Supabaseダッシュボード（GUI）での直接的なスキーマ変更は禁止
- マイグレーションファイルは `supabase/migrations/` 配下にタイムスタンプ付きで自動生成される

## 【必須】マイグレーション適用

- リモートDBへの反映は `supabase db push` で行う
- 手動でSQLを直接実行してスキーマを変更しない

## 【必須】型生成

- スキーマ変更後は `supabase gen types typescript --project-id <project-id> > src/types/database.types.ts` で型定義を再生成する
- 型定義ファイルは手動で編集しない（常に自動生成で上書き）

## 【必須】Data API公開のためのGRANT付与

> 背景: Supabaseの仕様変更により、2026/05/30以降の新規プロジェクトと2026/10/30以降の既存プロジェクトでは、`public` スキーマで作成したテーブルがData API（supabase-js / PostgREST / GraphQL）にデフォルトで公開されなくなる。明示的な `GRANT` が無い場合、PostgRESTは `42501` エラーを返す。

- 新規テーブル作成マイグレーションでは、`CREATE TABLE` 直後に必ず以下のGRANTを記述する（不要なロールへの付与は省く）
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` と `CREATE POLICY` だけでは公開されない。GRANTが前提
- 公開読み取り（マスターデータ等）は `anon` にもSELECTを付与する。ユーザー固有データなら `authenticated` のみで十分
- `service_role` は管理用ロールなので、サーバー側からアクセスするテーブルには付与する

```sql
-- 例1: ユーザー固有データ（認証必須）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO service_role;

-- 例2: 公開マスターデータ（未認証含む全員が閲覧可能）
GRANT SELECT ON public.<table_name> TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO service_role;
```

## 【必須】接続確認・プロジェクト操作は CLI 経由（curl 直叩き禁止）

- Supabase への疎通確認・プロジェクト操作は **Supabase CLI（`supabase` / `npx supabase`）経由で行う**
- Management API（`https://api.supabase.com/...`）を `curl` で直接叩かない。トークンを `Authorization` ヘッダで外部送信する形になり、サンドボックス/権限ポリシーで拒否されやすい（毎回失敗しがち）
- トークンは `.env.local` の `SUPABASE_ACCESS_TOKEN` を読み込んで CLI に環境変数で渡す。値はコマンドライン・ログに露出させない

```bash
# .env.local から読み込み（値は表示しない）
set -a; . ./.env.local; set +a

# 疎通確認・プロジェクト一覧
npx supabase projects list

# 例: マイグレーション反映（CLI が SUPABASE_ACCESS_TOKEN を利用）
npx supabase db push
```
