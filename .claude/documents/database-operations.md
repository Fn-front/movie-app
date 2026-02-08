# データベース運用ガイド

## Supabaseプロジェクト情報

- **プロジェクト名:** movie-app
- **リージョン:** Northeast Asia (Tokyo) / ap-northeast-1

接続情報はSupabaseダッシュボードの Settings > Database で確認。

## psql接続

### 前提条件

```bash
# libpq（psqlを含む）のインストール
brew install libpq
```

`libpq`はkeg-onlyのため、PATHに入っていない場合は `brew --prefix libpq` でパスを確認。

### 接続コマンド

```bash
# <REF_ID>はSupabaseのReference ID、<DB_PASSWORD>はDBパスワード
psql "postgresql://postgres.<REF_ID>:<DB_PASSWORD>@<POOLER_HOST>:5432/postgres"
```

Poolerホスト・Reference IDはSupabaseダッシュボードの Settings > Database で確認可能。

---

## Migration管理

### ファイル構成

```
supabase/migrations/
  20260202000000_initial_schema.sql         # 初期スキーマ（8テーブル + RLS）
  20260208000000_add_user_role.sql          # usersにroleカラム追加
  20260208100000_add_password_security.sql  # password_changed_at追加、rate_limits制約更新
```

### コマンド

```bash
# 未適用のmigrationをリモートDBに適用
supabase db push

# リモートDBからスキーマ差分を取得
supabase db pull

# ローカルDBとの差分確認
supabase db diff
```

---

## Seeder

### 管理者ユーザー

**ファイル:** `supabase/seeds/admin_user.sql`

```bash
# psqlで直接実行
psql "<接続文字列>" -f supabase/seeds/admin_user.sql
```

**デフォルト値:**
- email: `admin@example.com`
- password: `Admin1234`（本番では必ず変更）
- role: `admin`

**パスワードハッシュの再生成:**

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('新しいパスワード', 12).then(h => console.log(h));"
```

---

## 適用済み状態（2026-02-08時点）

- [x] 初期スキーマ（8テーブル + RLS + インデックス + トリガー）
- [x] roleカラム追加（user / admin）
- [x] password_changed_atカラム追加
- [x] rate_limits制約更新（change_password追加）
- [x] 管理者ユーザーSeeder実行済み
