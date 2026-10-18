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

### 「リモートにあるがローカルに無い」で push が拒否されたら

```
LegacyDbPushMissingLocalError: Remote migration versions not found in local migrations directory.
```

**これは異常ではない。** DBが1つしかなく、ローカル Postgres（`supabase start`）も使っていないため、作業中のブランチはスキーマ変更をリモートへ先行適用するしかない。その状態で main から push すると、main に無いマイグレーションを検出してこのエラーになる。**先行していたブランチがマージされれば自動的に解消する。**

#### ⛔ `migration repair --status reverted` を実行しない

CLI はこのエラーに対して次を提案してくるが、**適用済みのマイグレーションに対して使ってはいけない**。

```bash
supabase migration repair --status reverted <version>   # ← 実行しない
```

スキーマは変わったまま履歴だけ「未適用」に書き換わり、履歴とDBの実体が乖離する。次回以降の push が壊れ、復旧も難しくなる。

#### 安全な回避手順

先行しているマイグレーションを**一時的にローカルへ置いてから** push し、終わったら消す。マイグレーション履歴テーブルには触らない。

```bash
# 1. どのブランチの何が先行しているかを特定する
git log --all --oneline --diff-filter=A --name-only -- 'supabase/migrations/<version>*'

# 2. そのファイルだけを一時的に取り出す（コミットしない）
git show <branch>:supabase/migrations/<file>.sql > supabase/migrations/<file>.sql

# 3. 適用（自分のマイグレーションが先行分より古い場合は --include-all が要る）
npx supabase db push --dry-run   # 対象が自分の1件だけか確認してから
npx supabase db push

# 4. 一時ファイルを消す
rm supabase/migrations/<file>.sql
```

#### ブランチを破棄する場合

自動解消しない唯一のケース。先行適用したマイグレーションが main に入らないまま終わると、**どのファイルにも記述が無いスキーマがDBに残り続ける**。ブランチを破棄するときは、その変更を打ち消す逆マイグレーションを作って適用すること。

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

> 背景: 関数の EXECUTE は2系統で付与される。(1) PostgreSQL が `CREATE FUNCTION` 時に **PUBLIC へ自動付与**する分、(2) Supabase が `ALTER DEFAULT PRIVILEGES` で **anon / authenticated へ付与**する分。**両方を剥奪しないと**、公開されている anon キーから `POST /rest/v1/rpc/<関数名>` で到達できる。`SECURITY INVOKER` なら呼び出しロールの権限で弾かれるが、`SECURITY DEFINER` に変えた瞬間に実害へ変わる（過去に約1.8日間、anon キーだけで `now_showing_movies` を全件差し替えできる状態が実在した）。

- 関数を作成したら、`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` と必要ロールへの `GRANT EXECUTE` を**同じマイグレーションに書く**
- **`FROM PUBLIC` だけでは不十分**。anon / authenticated への付与が残り、剥奪したつもりで素通りする
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

REVOKE EXECUTE ON FUNCTION public.<fn>(<argtypes>) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<fn>(<argtypes>) TO service_role;
```

なお `20261018042537` で既定権限を絞っているため、以降に作る関数には自動で適用される。ただし**明示的に書くこと**（既定権限は環境差で効かない場合があり、意図も読み取れないため）。

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
```

⚠️ `CREATE OR REPLACE` は既存権限を保持するが、**`DROP FUNCTION` → `CREATE` では既定付与が復活しうる**。関数を作り直すときは権限を書き直すこと。

⚠️ 権限は `REVOKE` 文を読むだけでは確認できない。適用前に `pg_proc.proacl` を実測すること（トランザクション内で実行 → 確認 → `ROLLBACK`）。

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
