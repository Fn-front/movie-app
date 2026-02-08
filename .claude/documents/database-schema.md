# データベース設計

## プラットフォーム

**Supabase (PostgreSQL)**
- Supabase SDK for データアクセス
- Row Level Security (RLS) でセキュリティ管理
- UUID生成: `gen_random_uuid()`
- タイムスタンプ: `now()`

## テーブル設計

### users（ユーザー）
ユーザーアカウント情報を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | ユーザーID（主キー） |
| email | VARCHAR(255) | NOT NULL | - | メールアドレス（ユニーク） |
| password_hash | VARCHAR(255) | NOT NULL | - | ハッシュ化されたパスワード |
| name | VARCHAR(100) | NULL | - | ユーザー名 |
| avatar_url | TEXT | NULL | - | アバター画像URL |
| role | VARCHAR(20) | NOT NULL | 'user' | ユーザー権限（user / admin） |
| is_verified | BOOLEAN | NOT NULL | false | メール認証済みフラグ |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `email` (UNIQUE)

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- UPDATE: 自分のレコードのみ更新可能
- DELETE: 自分のレコードのみ削除可能
- INSERT: 公開（新規登録用）

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

**アーカイブ機能: 物理削除**
- OTP認証完了後（is_used = true）、該当レコードを物理削除
- 削除タイミング: 認証成功直後のAPI呼び出し内で実行
- 理由: セキュリティ（使用済みトークンの残留を防ぐ）

---

### password_reset_tokens（パスワードリセット）
パスワードリセット用のトークン管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | トークンID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| token | VARCHAR(64) | NOT NULL | - | リセットトークン（ハッシュ化） |
| expires_at | TIMESTAMP | NOT NULL | - | 有効期限（1時間） |
| is_used | BOOLEAN | NOT NULL | false | 使用済みフラグ |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |

**インデックス:**
- `token` (UNIQUE)
- `user_id`
- `expires_at`

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**アーカイブ機能: 物理削除**
- パスワードリセット完了後（is_used = true）、該当レコードを物理削除
- 削除タイミング: パスワード更新成功直後のAPI呼び出し内で実行
- 理由: セキュリティ（使用済みトークンの残留を防ぐ）

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
| deleted_at | TIMESTAMP | NULL | - | 削除日時（論理削除） |
| notes | TEXT | NULL | - | メモ（将来的に使用） |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE) - 重複登録防止
- `user_id` - ユーザー検索の高速化
- `added_at` - 追加日順ソート用
- `deleted_at` - 論理削除フィルタ用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**削除方式: 論理削除**
- ユーザーが削除した場合、`deleted_at`に現在時刻を設定
- 取得時は`WHERE deleted_at IS NULL`でフィルタ
- データは物理的には残る（復元・分析用）

---

### movie_cache（映画情報キャッシュ）
TMDb APIから取得した映画一覧情報をキャッシュ（ホーム画面用）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | INTEGER | NOT NULL | - | TMDb映画ID（主キー） |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| backdrop_path | VARCHAR(255) | NULL | - | 背景画像パス |
| release_date | DATE | NULL | - | 公開日 |
| overview | TEXT | NULL | - | 概要 |
| vote_average | DECIMAL(3,1) | NULL | - | 評価平均 |
| popularity | DECIMAL(10,3) | NULL | - | 人気度 |
| genre_ids | JSONB | NULL | - | ジャンルID配列 |
| cached_at | TIMESTAMP | NOT NULL | NOW() | 初回キャッシュ日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 最終更新日時 |

**インデックス:**
- `release_date` - 公開日順ソート用
- `popularity` - 人気順ソート用
- `cached_at` - 差分取得時の最新日時確認用
- `updated_at` - バッチ更新管理用

**キャッシュ戦略:**
- 初回取得: 今日から3ヶ月先の映画を取得
- 差分取得: MAX(cached_at)以降の新作映画のみ取得
- バッチ更新: 1日1回、全件の評価・人気度を更新
- 詳細画面: キャッシュを使わず都度TMDb APIから取得

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

### reviews（レビュー・評価）
将来的なレビュー機能用のユーザーレビューデータ

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | uuid_generate_v4() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| rating | DECIMAL(2,1) | NOT NULL | - | 評価（0.5-5.0） |
| comment | TEXT | NULL | - | レビューコメント（500文字以内） |
| created_at | TIMESTAMP | NOT NULL | NOW() | 投稿日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 更新日時 |

**インデックス:**
- `tmdb_movie_id` - 映画別レビュー取得用
- `user_id, tmdb_movie_id` (UNIQUE) - 重複投稿防止
- `created_at` - 新着順ソート用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**制約:**
- `rating` は 0.5 から 5.0 の範囲（CHECK制約）
- `comment` は 500文字以内

---

### rate_limits（レート制限管理）
ログイン試行、OTP検証などのレート制限を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| identifier | VARCHAR(255) | NOT NULL | - | 識別子（IPアドレス or ユーザーID） |
| action_type | VARCHAR(50) | NOT NULL | - | アクション種別（login, otp_verify, otp_resend） |
| attempts | INTEGER | NOT NULL | 0 | 試行回数 |
| locked_until | TIMESTAMP | NULL | - | ロック解除時刻 |
| last_attempt_at | TIMESTAMP | NOT NULL | now() | 最終試行時刻 |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `identifier, action_type` (UNIQUE) - 重複防止
- `locked_until` - ロック解除チェック用

**制約:**
- `action_type` は 'login', 'otp_verify', 'otp_resend' のいずれか（ENUM型 or CHECK制約）

**レート制限ルール:**
- **login**: 3回失敗で30分ロック
- **otp_verify**: 3回失敗で30分ロック
- **otp_resend**: 5分間隔で再送信可能

**クリーンアップ:**
- ロック解除時刻を過ぎたレコードは定期的に削除（Vercel Cron Jobs）
- または、レコード取得時に`locked_until < now()`をチェックして自動リセット

---

## ER図（概念図）

```
users (1) ----< (N) watchlist
  |
  | (1)
  |
  +----< (N) otp_tokens
  |
  | (1)
  |
  +----< (N) password_reset_tokens
  |
  | (1)
  |
  +---- (1) user_preferences
  |
  | (1)
  |
  +----< (N) reviews
```

---

## Row Level Security (RLS) ポリシー

すべてのテーブルでRLSを有効化し、`auth.uid()`ベースのアクセス制御を実装します。

### 基本方針

- **ユーザーデータ**: 自分のデータのみアクセス可能（`auth.uid() = user_id`）
- **公開データ**: 全員閲覧可能（例: movie_cache）
- **認証なしINSERT**: 新規登録・OTP発行で必要な場合のみ許可

詳細なRLS SQL実装は `.claude/skills/db-schema` skillを参照してください。

## 確認事項

- [x] **キャッシュ取得範囲**: 初回は今日から3ヶ月先 - 確定
- [x] **バッチ更新頻度**: 1日1回 - 確定
- [x] **ページネーション**: 20件/ページ - 確定
- [x] **watchlistテーブル**: 映画IDと画像URLを保存 - 確定
- [ ] **インデックス追加**: 他に必要なインデックスは？

### データ管理
- [x] **watchlist削除方式**: 論理削除 - 確定
  - deleted_atカラムで管理
  - 復元・分析用にデータ保持
- [x] **認証トークンのアーカイブ**: 認証完了後に物理削除 - 確定
  - OTPトークン: 認証成功直後に削除
  - パスワードリセットトークン: パスワード更新成功直後に削除
  - セキュリティ目的（使用済みトークンの残留防止）
- [ ] **データバックアップ**: 未定（将来的に検討）

### 将来的な拡張
- [ ] **watched（見た映画）テーブル**: 必要？
- [ ] **ratings（評価）テーブル**: ユーザー独自の評価機能は必要？
- [ ] **reviews（レビュー）テーブル**: レビュー機能は必要？
