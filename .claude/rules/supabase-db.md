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
