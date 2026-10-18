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

## 【必須】関数は EXECUTE を PUBLIC から剥奪する

> 背景: PostgreSQL は `CREATE FUNCTION` 時に **EXECUTE を PUBLIC へ自動付与**する。剥奪しないと、公開されている anon キーから `POST /rest/v1/rpc/<関数名>` で到達できる。`SECURITY INVOKER` なら呼び出しロールの権限で弾かれるが、`SECURITY DEFINER` に変えた瞬間に実害へ変わる（過去に約1.8日間、anon キーだけで `now_showing_movies` を全件差し替えできる状態が実在した）。

- 関数を作成したら、`REVOKE EXECUTE ... FROM PUBLIC` と必要ロールへの `GRANT EXECUTE` を**同じマイグレーションに書く**
- **`service_role` は superuser ではない**。PUBLIC を剥奪したら明示的に GRANT しないと、サーバー側の呼び出しが `42501` で全て落ちる
- `anon` に付与するのは、未認証クライアントが実際に呼ぶ関数だけ（現状は `get_award_years` のみ）
- `SECURITY DEFINER` は原則使わない。RLS をバイパスするため、使うなら理由をコメントで残す
- `SET search_path = public, pg_temp` を必ず付ける（Supabase lint: `function_search_path_mutable`）

```sql
CREATE OR REPLACE FUNCTION public.<fn>(<args>)
RETURNS <type>
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ ... $$;

REVOKE EXECUTE ON FUNCTION public.<fn>(<argtypes>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<fn>(<argtypes>) TO service_role;
```

なお `20261018042537` で既定権限を絞っているため、以降に作る関数には自動で適用される。ただし**明示的に書くこと**（既定権限は環境差で効かない場合があり、意図も読み取れないため）。

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

⚠️ `CREATE OR REPLACE` は既存権限を保持するが、**`DROP FUNCTION` → `CREATE` では PUBLIC EXECUTE が復活しうる**。関数を作り直すときは権限を書き直すこと。

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
