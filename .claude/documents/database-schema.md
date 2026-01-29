# データベース設計

## テーブル設計

### users（ユーザー）
ユーザーアカウント情報を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | ユーザーID（主キー） |
| email | VARCHAR(255) | NOT NULL | - | メールアドレス（ユニーク） |
| password_hash | VARCHAR(255) | NOT NULL | - | ハッシュ化されたパスワード |
| name | VARCHAR(100) | NULL | - | ユーザー名 |
| avatar_url | TEXT | NULL | - | アバター画像URL |
| is_verified | BOOLEAN | NOT NULL | false | メール認証済みフラグ |
| created_at | TIMESTAMP | NOT NULL | NOW() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 更新日時 |

**インデックス:**
- `email` (UNIQUE)

---

### otp_tokens（ワンタイムパスワード）
新規登録時の認証トークン管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | トークンID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| token | VARCHAR(6) | NOT NULL | - | 6桁のOTPコード |
| expires_at | TIMESTAMP | NOT NULL | - | 有効期限 |
| is_used | BOOLEAN | NOT NULL | false | 使用済みフラグ |
| created_at | TIMESTAMP | NOT NULL | NOW() | 作成日時 |

**インデックス:**
- `user_id, token` (UNIQUE)
- `expires_at`

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

---

### watchlist（見たい映画リスト）
ユーザーの見たい映画を管理（映画IDと画像URLを保存）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| backdrop_path | VARCHAR(255) | NULL | - | 背景画像パス |
| release_date | DATE | NULL | - | 公開日 |
| added_at | TIMESTAMP | NOT NULL | NOW() | 追加日時 |
| notes | TEXT | NULL | - | メモ（将来的に使用） |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE) - 重複登録防止
- `user_id` - ユーザー検索の高速化
- `added_at` - 追加日順ソート用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

---

### ~~movie_cache（映画情報キャッシュ）~~
**使用しない** - キャッシュ戦略「キャッシュしない」のため、このテーブルは実装しない

---

### user_preferences（ユーザー設定）
将来的なOpenAIレコメンド機能用のユーザー嗜好データ

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| favorite_genres | JSONB | NULL | - | お気に入りジャンル |
| preferred_languages | JSONB | NULL | - | 優先言語 |
| analysis_data | JSONB | NULL | - | AI分析用データ |
| created_at | TIMESTAMP | NOT NULL | NOW() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 更新日時 |

**インデックス:**
- `user_id` (UNIQUE)

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

---

## ER図（概念図）

```
users (1) ----< (N) watchlist
  |
  | (1)
  |
  V
  | (1)
  |
otp_tokens (N)
  |
  | (1)
  |
  V
  | (1)
  |
user_preferences (1)
```

## 確認が必要な事項

### データベース選定
- [ ] **PostgreSQL直接 or Supabase?**
  - Supabaseの場合、RLSポリシーをどう設定するか？
  - 直接接続の場合、ホスティング先は？

### セキュリティ
- [ ] **パスワードハッシュアルゴリズム**: bcrypt or argon2?
- [ ] **OTPコード**: 6桁数字 or 英数字混合?
- [ ] **OTP有効期限**: 何分に設定するか？(推奨: 10分)
- [ ] **トークン再生成**: 何回まで許可するか？

### パフォーマンス
- [x] **movie_cacheテーブル**: 実装しない - 確定（キャッシュ戦略: キャッシュしない）
- [x] **watchlistテーブル**: 映画IDと画像URLを保存 - 確定
- [ ] **インデックス追加**: 他に必要なインデックスは？

### データ管理
- [ ] **論理削除 or 物理削除**: watchlistの削除方法は？
- [ ] **アーカイブ機能**: 古いOTPトークンの削除タイミングは？
- [ ] **データバックアップ**: 戦略は？

### 将来的な拡張
- [ ] **watched（見た映画）テーブル**: 必要？
- [ ] **ratings（評価）テーブル**: ユーザー独自の評価機能は必要？
- [ ] **reviews（レビュー）テーブル**: レビュー機能は必要？
