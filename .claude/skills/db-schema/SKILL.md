---
name: db-schema
description: Create a Supabase table definition with grants and migrations
disable-model-invocation: true
argument-hint: <tableName>
---

# Supabaseテーブル定義スキル

このスキルは、プロジェクトのデータベース設計に従って Supabase のテーブル定義（マイグレーション・GRANT・RLS）を作成します。

## 必須要件

> ⛔ **`auth.users` を参照しない。** このリポジトリの認証は **NextAuth** で、
> 利用者は自前の **`public.users`** にいる。Supabase Auth は使っていないので
> `auth.users` に行が無く、参照すると**マイグレーションが外部キー違反で落ちる**。
> `supabase/migrations/` 全件を見ても `auth.users` の参照は1つも無い。


### アーキテクチャ原則

- **Row Level Security (RLS)**: すべてのテーブルで有効化する。ただし
  **`auth.uid()` のポリシーは書かない**（このリポジトリでは常に NULL。
  後述の「Row Level Security (RLS)」を必ず読むこと）
- **認可はアプリ側**: `.eq('user_id', session.user.id)` が唯一効いている防御
- **GRANT付与**: `service_role` のみ。`authenticated` には付与しない
- **UUID主キー**: `gen_random_uuid()`を使用
- **タイムスタンプ**: `TIMESTAMPTZ` を使う（`TIMESTAMP` は JST 換算でズレる）
- **論理削除**: ユーザーデータは`deleted_at`で論理削除。一意制約は部分インデックスに
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
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Data Fields
  <field_name> <data_type> NOT NULL,
  <field_name> <data_type> NULL,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL  -- 論理削除用（必要な場合）
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
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

## GRANT（ロールごとのテーブル権限）

> 2026/05/30以降の新規Supabaseプロジェクト、2026/10/30以降の既存プロジェクトでは、
> `public` スキーマのテーブルはGRANTを明示しないとData API（supabase-js /
> PostgREST / GraphQL）からアクセスできない。

⛔ **新しいテーブルで `authenticated` に付与しない。**
`20261018053616_declare_table_grants.sql` が

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
```

を打ち、当時あった17テーブルには個別の
`REVOKE ALL ... FROM anon, authenticated` も並べている。
`authenticated` ロールに切り替わる経路（Supabase の JWT）が**そもそも無い**ので
（下の「RLS」参照）、付与しても使われず漏洩面が増えるだけ。

> ⚠️ **例外が1つ実在する。** `movie_streaming_status` は剥奪マイグレーションの
> **後**（`20261101142314`）に `GRANT SELECT ... TO authenticated` を打ったまま
> 残っている。到達経路が無いので実害は出ていないが、**手本にしない**。
> 剥がす作業は #1381。

### パターンA: ユーザー固有データ（既定。ほぼ全テーブルがこれ）

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO service_role;
```

### パターンB: サーバーが anon キーで読むデータ

```sql
GRANT SELECT ON public.<table_name> TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table_name> TO service_role;
```

⚠️ **現状これに当てはまるのは `award_movies` と `now_showing_movies` の2つだけ。**

⛔ **「未認証で叩けるから anon」ではない。** `/api/movies` のような公開ルートも
`createServiceRoleClient()` を使っている。**ブラウザから Supabase を叩く経路は
1つも無い**（`@supabase/supabase-js` を import する `'use client'` のファイルは
0件）ので、anon を選ぶ理由は「クライアント用だから」ではない。

上の2つが anon なのは、**サーバー側で anon キーを使う事情**があるため。
`now_showing_movies` は `unstable_cache` の中から読むので `cookies()` に
依存するクライアントを作れない（`nowShowing.server.ts`）。
新しく足すときは、同じ事情があるか確かめること。無ければ service_role でよい。

### パターンD: 関数（RPC・トリガー関数）

> 関数の EXECUTE は2系統で付与される。(1) PostgreSQL が `CREATE FUNCTION` 時に **PUBLIC へ自動付与**する分、(2) Supabase が `ALTER DEFAULT PRIVILEGES` で **anon / authenticated へ付与**する分。**両方を剥奪しないと**、公開されている anon キーから `POST /rest/v1/rpc/<関数名>` で到達できる。

```sql
CREATE OR REPLACE FUNCTION public.<fn>(<args>)
RETURNS <type>
LANGUAGE plpgsql
SECURITY INVOKER          -- DEFINER は RLS をバイパスする。使うなら理由をコメントで残す
SET search_path = public, pg_temp
AS $$ ... $$;

REVOKE EXECUTE ON FUNCTION public.<fn>(<argtypes>) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<fn>(<argtypes>) TO service_role;
```

- **`FROM PUBLIC` だけでは不十分。** anon / authenticated への付与が残る
- **`service_role` は superuser ではない。** 権限を剥奪したら明示的に GRANT しないと、サーバー側の呼び出しが `42501` で全て落ちる（service_role は REVOKE 対象に含めない）
- `anon` に付与するのは、未認証クライアントが実際に呼ぶ関数だけ
- `CREATE OR REPLACE` は既存権限を保持するが、**`DROP FUNCTION` → `CREATE` では既定付与が復活しうる**
- `RETURNS TRIGGER` の関数は PostgREST が RPC として公開しないため REVOKE 不要。ただし `search_path` は固定する

## Row Level Security (RLS)

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
```

**有効化は必ずする。** ただし次を理解したうえで書くこと。

### ⛔ `auth.uid()` はこのリポジトリでは常に NULL

`auth.uid()` は **Supabase が発行した JWT** の `sub` を読む関数。このアプリの
認証は NextAuth で、Supabase のセッションを作る経路が無い（`setSession` も
`global.headers.Authorization` も使っていない）。したがって

- `USING (auth.uid() = user_id)` は **常に偽** → 実質 deny-all
- 実アクセスは全部 `service_role` で、**RLS をバイパスする**

つまり **RLS は現状どのリクエストも制限していない。** 既存マイグレーションに
`auth.uid()` のポリシーが並んでいるのは初期スキーマの名残で、**手本にしない。**

> ⚠️ 厳密には、ポリシーが経路に乗っているテーブルが1つある
> （`movie_streaming_status`。上記 #1381）。ただしそこへ到達する
> `authenticated` のリクエストが存在しないので、結論は変わらない。

### 本当の認可はアプリ側にある

`user_id` の絞り込みは**クエリに自分で書く**。これが唯一効いている防御なので、
抜けると他人のデータが返る。

```ts
const { data } = await supabase
  .from('watchlist')
  .select('*')
  .eq('user_id', session.user.id)   // ← ここが認可。消すと全件返る
  .is('deleted_at', null);
```

### 新しいテーブルに書くポリシー

**deny-all を明示する**のが実態に合う。将来 anon / authenticated 経路を
足したときに、意図しない読み取りが開かない。

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
-- ポリシーを1つも作らない = deny-all（service_role はバイパスするので影響なし）
```

anon に読ませるテーブルだけ、明示的に開ける。

```sql
CREATE POLICY <table_name>_select_public ON <table_name>
  FOR SELECT
  USING (true);
```

⚠️ `CREATE POLICY` だけでは Data API に公開されない。**GRANT が前提**（上記）。

## データ型ガイドライン

| 用途 | データ型 | 例 |
|------|----------|-----|
| 主キー | `UUID` | `id UUID DEFAULT gen_random_uuid()` |
| 外部キー（ユーザー） | `UUID` | `user_id UUID REFERENCES users(id)` |
| 外部キー（TMDb） | `INTEGER` | `tmdb_movie_id INTEGER NOT NULL` |
| 文字列（短） | `VARCHAR(255)` | `email VARCHAR(255)` |
| 文字列（長） | `TEXT` | `bio TEXT` |
| 数値（整数） | `INTEGER` | `rating INTEGER` |
| 数値（小数） | `DECIMAL(10,2)` | `price DECIMAL(10,2)` |
| 真偽値 | `BOOLEAN` | `is_verified BOOLEAN DEFAULT false` |
| 日時 | `TIMESTAMPTZ` | `created_at TIMESTAMPTZ DEFAULT now()` |
| JSON | `JSONB` | `metadata JSONB` |

⚠️ **新しい列は `TIMESTAMPTZ`。** `TIMESTAMP`（naive）だと、JST で年や日を
切るときに `AT TIME ZONE` が逆変換になってズレる。`watchlist` は
`20261101095646` で移行済みだが、**まだ naive のまま残っている列がある**
（`accounts` / `rate_limits` / `user_settings` の各 `created_at` `updated_at`、
`now_showing_movies.fetched_at`、`movie_cache.updated_at`）。既存に倣わないこと。

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
-- ⚠️ 論理削除するテーブルでは部分インデックスにする（下記「論理削除パターン」）
CONSTRAINT unique_user_tmdb UNIQUE (user_id, tmdb_movie_id)
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
-- deleted_at カラムを追加（TIMESTAMPTZ）
deleted_at TIMESTAMPTZ NULL,

-- 一意制約は「生きている行」だけに掛ける。
-- 素の UNIQUE だと、一度消した映画を再追加できない
CREATE UNIQUE INDEX idx_watchlist_user_movie
  ON watchlist (user_id, tmdb_movie_id)
  WHERE deleted_at IS NULL;
```

⚠️ **除外は RLS ではなくクエリに書く。** `auth.uid()` のポリシーは効いていない
（上記）ので、`.is('deleted_at', null)` を書き忘れると削除済みが混ざる。

```ts
// 読み取り
await supabase.from('watchlist').select('*')
  .eq('user_id', session.user.id)
  .is('deleted_at', null);

// 論理削除
await supabase.from('watchlist').update({ deleted_at: new Date().toISOString() })
  .eq('id', id).eq('user_id', session.user.id);
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
└── <timestamp>_create_<tableName>.sql
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
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ⚠️ 実テーブルの列名は tmdb_movie_id（tmdb_id ではない）
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- Indexes
-- 一意制約は生きている行だけ（再追加できるようにする）
CREATE UNIQUE INDEX idx_watchlist_user_movie
  ON watchlist (user_id, tmdb_movie_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX idx_watchlist_deleted_at ON watchlist(deleted_at);

-- GRANT（パターンA）
-- ⚠️ authenticated には付与しない。切り替わる経路が無い
GRANT SELECT, INSERT, UPDATE, DELETE ON watchlist TO service_role;

-- RLS: 有効化してポリシーは作らない（deny-all）。
-- 認可は API Route 側の .eq('user_id', session.user.id) が担う
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

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
