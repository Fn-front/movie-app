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
| password_hash | VARCHAR(255) | NULL | - | ハッシュ化されたパスワード（ソーシャルログインユーザーはNULL） |
| name | VARCHAR(100) | NULL | - | ユーザー名 |
| avatar_url | TEXT | NULL | - | アバター画像URL |
| role | VARCHAR(20) | NOT NULL | 'user' | ユーザー権限（user / admin） |
| is_verified | BOOLEAN | NOT NULL | false | メール認証済みフラグ |
| password_changed_at | TIMESTAMPTZ | NULL | - | パスワード最終変更日時 |
| last_login_at | TIMESTAMPTZ | NULL | - | 最終ログイン日時（signIn時 + セッション更新時に1時間間隔で更新） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |

**インデックス:**
- `email` (UNIQUE)

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- UPDATE: 自分のレコードのみ更新可能
- DELETE: 自分のレコードのみ削除可能
- INSERT: 公開（新規登録用）

---

### accounts（ソーシャルログインアカウント）
OAuthプロバイダーとのアカウント連携情報を管理（NextAuth.jsアダプター準拠）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| provider | VARCHAR(50) | NOT NULL | - | プロバイダー名（google / github） |
| provider_account_id | VARCHAR(255) | NOT NULL | - | プロバイダー側のアカウントID |
| type | VARCHAR(20) | NOT NULL | 'oauth' | アカウント種別（oauth） |
| access_token | TEXT | NULL | - | アクセストークン |
| refresh_token | TEXT | NULL | - | リフレッシュトークン |
| expires_at | INTEGER | NULL | - | トークン有効期限（UNIX timestamp） |
| token_type | VARCHAR(50) | NULL | - | トークン種別 |
| scope | VARCHAR(255) | NULL | - | スコープ |
| id_token | TEXT | NULL | - | IDトークン |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `provider, provider_account_id` (UNIQUE) - プロバイダー内での一意性
- `user_id` - ユーザー別アカウント取得用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- INSERT: サーバー側のみ（service role）
- UPDATE: サーバー側のみ（service role）
- DELETE: 自分のレコードのみ削除可能

**NextAuth.jsからの操作方法:**
- NextAuth.jsのカスタムアダプターではなく、signInコールバック内でSupabase service roleクライアントを使用してaccountsテーブルを直接操作する
- OAuth認証成功時にsignInコールバックでアカウントリンク処理を実行し、service roleキーでINSERT/UPDATEを行う

---

### otp_codes（OTP検証コード）
メール認証用の6桁ワンタイムコードを管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| email | VARCHAR(255) | NOT NULL | - | 送信先メールアドレス |
| code | VARCHAR(6) | NOT NULL | - | 6桁OTPコード |
| action_type | VARCHAR(50) | NOT NULL | - | アクション種別（registration / login / password_change） |
| attempts | INTEGER | NOT NULL | 0 | 検証試行回数 |
| expires_at | TIMESTAMP | NOT NULL | - | 有効期限（作成時刻 + 10分） |
| verified_at | TIMESTAMP | NULL | - | 検証完了日時 |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |

**インデックス:**
- `email, action_type, created_at` - メール・アクション・日時での検索用
- `expires_at` - 期限切れレコードのクリーンアップ用

**制約:**
- `action_type` は 'registration', 'login', 'password_change' のいずれか（CHECK制約）
- `attempts` は 0〜5 の範囲（CHECK制約）
- `code` は 6桁数字（CHECK制約）

**設計判断 — user_id FKを持たない理由:**
- 現在の設計では新規登録時にユーザーが先に作成される（is_verified = false）ため、user_id FKを持たせることは可能
- しかし、emailベースにすることで以下のメリットがある:
  - OTPテーブルがusersテーブルに依存しないシンプルな設計
  - 将来的にユーザー作成前にメール到達確認を行うフローに変更しやすい
  - RLSを使わずservice roleでの操作に統一できる（OTPはサーバー側でのみ操作）

**クリーンアップ:**
- 有効期限切れ（`expires_at < now()`）のレコードはVercel Cron Jobsで定期削除（rate_limitsと同一ジョブ）
- 検証成功時のレコードは即座に削除

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
- `user_id, tmdb_movie_id` (UNIQUE, WHERE deleted_at IS NULL) - 重複登録防止（論理削除済みは対象外、再追加可能）
- `user_id` - ユーザー検索の高速化
- `added_at` - 追加日順ソート用（カーソルベースページングのカーソル）
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
| release_type | VARCHAR(20) | NOT NULL | 'theatrical' | リリースタイプ（theatrical / streaming） |
| is_revival | BOOLEAN | NOT NULL | false | リバイバル上映フラグ |
| is_now_playing | BOOLEAN | NOT NULL | false | TMDb now_playing リスト掲載フラグ |
| cached_at | TIMESTAMP | NOT NULL | NOW() | 初回キャッシュ日時 |
| updated_at | TIMESTAMP | NOT NULL | NOW() | 最終更新日時 |

**インデックス:**
- `id, release_type` (UNIQUE) - 複合主キー
- `release_date` - 公開日順ソート用
- `popularity` - 人気順ソート用
- `cached_at` - 差分取得時の最新日時確認用
- `updated_at` - バッチ更新管理用
- `is_now_playing` - Now Playing フィルタ用

**キャッシュ戦略:**
- 初回取得: 今日から3ヶ月先の映画を取得
- 差分取得: MAX(cached_at)以降の新作映画のみ取得
- バッチ更新: 1日1回、全件の評価・人気度を更新
- 詳細画面: キャッシュを使わず都度TMDb APIから取得

---

### user_settings（ユーザー設定）
ユーザーのテーマ・通知などのアプリ設定を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー、ユニーク） |
| theme | VARCHAR(10) | NOT NULL | 'light' | テーマ（light / dark） |
| notification_enabled | BOOLEAN | NOT NULL | false | 通知有効フラグ |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `user_id` (UNIQUE)

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**RLS (Row Level Security):**
- SELECT: 自分のレコードのみ閲覧可能
- INSERT: 自分のレコードのみ作成可能
- UPDATE: 自分のレコードのみ更新可能
- DELETE: 自分のレコードのみ削除可能

---

### user_preferences（ユーザー嗜好データ）
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
| action_type | VARCHAR(50) | NOT NULL | - | アクション種別（login / otp_verify） |
| attempts | INTEGER | NOT NULL | 0 | 試行回数 |
| locked_until | TIMESTAMP | NULL | - | ロック解除時刻 |
| last_attempt_at | TIMESTAMP | NOT NULL | now() | 最終試行時刻 |
| created_at | TIMESTAMP | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | now() | 更新日時 |

**インデックス:**
- `identifier, action_type` (UNIQUE) - 重複防止
- `locked_until` - ロック解除チェック用

**制約:**
- `action_type` は 'login', 'change_password', 'otp_verify' 等（CHECK制約）

**レート制限ルール:**
- **login**: 3回失敗で30分ロック
- **change_password**: 3回失敗で30分ロック
- **otp_verify**: 5回失敗で該当OTP無効化

**クリーンアップ:**
- ロック解除時刻を過ぎたレコードは定期的に削除（Vercel Cron Jobs）
- または、レコード取得時に`locked_until < now()`をチェックして自動リセット

---

### recommendations（AIレコメンド）
OpenAI APIによるレコメンド映画を管理（日次Cronで全件入れ替え）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（FK → users.id） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| release_date | DATE | NULL | - | 公開日 |
| vote_average | NUMERIC(3,1) | NULL | - | TMDb評価 |
| genre_ids | INTEGER[] | NULL | - | ジャンルID配列 |
| reason | TEXT | NOT NULL | - | 推薦理由 |
| display_order | INTEGER | NOT NULL | - | 表示順序（1〜10） |
| generated_at | TIMESTAMPTZ | NOT NULL | now() | 生成日時 |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス:**
- `user_id` - ユーザー別一覧取得用
- `user_id, display_order ASC` - 表示順ソート用

**制約:**
- `uq_recommendations_user_order` (UNIQUE: user_id, display_order)
- `uq_recommendations_user_movie` (UNIQUE: user_id, tmdb_movie_id)
- `display_order BETWEEN 1 AND 10` (CHECK)

**RLSポリシー:**
- SELECT: 自分のレコメンドのみ参照可能（`auth.uid() = user_id`）
- INSERT/UPDATE/DELETE: service_roleのみ（Cron API経由、RLSバイパス）

**特徴:**
- 論理削除なし（日次で全件入れ替えのため）
- ON DELETE CASCADE（ユーザー削除時に自動削除）

---

### favorites（お気に入り映画）
ユーザーが独自の評価（1〜10点）を付けてお気に入り登録した映画を管理

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（外部キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| release_date | DATE | NULL | - | 公開日 |
| rating | INTEGER | NOT NULL | - | ユーザー評価（1〜10点） |
| added_at | TIMESTAMPTZ | NOT NULL | now() | 登録日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |
| deleted_at | TIMESTAMPTZ | NULL | - | 削除日時（論理削除） |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE, WHERE deleted_at IS NULL) - 重複登録防止（論理削除済みは対象外、再追加可能）
- `user_id` - ユーザー別一覧取得用
- `user_id, added_at DESC` (WHERE deleted_at IS NULL) - 登録日順ソート用
- `user_id, rating DESC` (WHERE deleted_at IS NULL) - 評価順ソート用

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**制約:**
- `rating` は 1〜10 の範囲（CHECK制約）

**トリガー:**
- `update_favorites_updated_at`: UPDATE時に `updated_at` を自動更新（`update_updated_at_column()` 関数を使用）

**削除方式: 論理削除**
- ユーザーが削除した場合、`deleted_at` に現在時刻を設定
- 取得時は `WHERE deleted_at IS NULL` でフィルタ

**RLS (Row Level Security):**
- SELECT: 自分のお気に入りのみ閲覧可能（`auth.uid() = user_id AND deleted_at IS NULL`）
- INSERT: 自分のお気に入りのみ追加可能（`auth.uid() = user_id`）
- UPDATE: 自分のお気に入りのみ更新可能（`auth.uid() = user_id`）
- DELETE: 自分のお気に入りのみ削除可能（`auth.uid() = user_id`）

---

### dismissed_movies（興味なし映画）
ユーザーが「興味なし」とした映画を管理（レコメンド精度向上用）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| user_id | UUID | NOT NULL | - | ユーザーID（FK → users.id） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス（設定ページの興味なし一覧でサムネイル表示用） |
| genre_ids | INTEGER[] | NULL | - | ジャンルID配列（傾向分析用） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | 更新日時 |
| deleted_at | TIMESTAMPTZ | NULL | - | 論理削除 |

**インデックス:**
- `user_id, tmdb_movie_id` (UNIQUE, WHERE deleted_at IS NULL) - 重複登録防止
- `user_id` - ユーザー別一覧取得用
- `user_id, created_at DESC` (WHERE deleted_at IS NULL) - 作成日順ソート用

**トリガー:**
- `update_dismissed_movies_updated_at`: UPDATE時に `updated_at` を自動更新

**外部キー:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**RLSポリシー:**
- SELECT/INSERT/UPDATE/DELETE: 自分のレコードのみ操作可能（`auth.uid() = user_id`）

**用途:**
- レコメンド生成時に除外IDとして使用
- ジャンル傾向分析でAIプロンプトに「避けるべきジャンル傾向」を含める
- 将来的に映画一覧でもフィルタに利用可能

---

### award_movies（受賞作品）
映画賞の受賞作品・ノミネート作品を管理（月次Cronで同期）

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | UUID | NOT NULL | gen_random_uuid() | レコードID（主キー） |
| tmdb_movie_id | INTEGER | NOT NULL | - | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | - | 映画タイトル |
| poster_path | VARCHAR(255) | NULL | - | ポスター画像パス |
| release_date | DATE | NULL | - | 公開日 |
| vote_average | NUMERIC(3,1) | NULL | - | TMDb評価 |
| genre_ids | INTEGER[] | NULL | - | ジャンルID配列 |
| award_name | VARCHAR(50) | NOT NULL | - | 賞名キー（academy_awards等） |
| award_year | INTEGER | NOT NULL | - | 授賞年度 |
| category | VARCHAR(50) | NOT NULL | - | 部門キー（best_picture等） |
| award_label | VARCHAR(100) | NOT NULL | - | 部門表示名（作品賞等） |
| is_winner | BOOLEAN | NOT NULL | false | 受賞フラグ |
| display_order | INTEGER | NOT NULL | - | 表示順序 |
| generated_at | TIMESTAMPTZ | NOT NULL | now() | 生成日時 |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

**インデックス:**
- `tmdb_movie_id, award_name, award_year, category` (UNIQUE) - 重複防止・UPSERT用

**制約:**
- `display_order >= 1` (CHECK)

**RLSポリシー:**
- SELECT: 全ユーザー参照可能（公開データ）
- INSERT/UPDATE/DELETE: service_roleのみ（Cron API経由、RLSバイパス）

**特徴:**
- ユーザーに紐付かない公開データ（FKなし）
- 月次Cronで対象月の賞を OpenAI + TMDb で取得・UPSERT
- 論理削除なし

---

## ER図（概念図）

```
users (1) ----< (N) watchlist
  |
  +----< (N) accounts
  |
  +---- (1) user_settings
  |
  +---- (1) user_preferences
  |
  +----< (N) favorites
  |
  +----< (N) recommendations
  |
  +----< (N) reviews
  |
  +----< (N) dismissed_movies

otp_codes（usersと直接FKなし、emailで紐付け）
award_movies（usersと紐付かない公開データ）
```

---

## Row Level Security (RLS) ポリシー

すべてのテーブルでRLSを有効化し、`auth.uid()`ベースのアクセス制御を実装します。

### 基本方針

- **ユーザーデータ**: 自分のデータのみアクセス可能（`auth.uid() = user_id`）
- **公開データ**: 全員閲覧可能（例: movie_cache）
- **認証なしINSERT**: 新規登録で必要な場合のみ許可

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
- [ ] **データバックアップ**: 未定（将来的に検討）

### 将来的な拡張
- [ ] **watched（見た映画）テーブル**: 必要？
- [ ] **ratings（評価）テーブル**: ユーザー独自の評価機能は必要？
- [ ] **reviews（レビュー）テーブル**: レビュー機能は必要？
