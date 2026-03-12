# API仕様書

## 基本情報

- **Base URL**: `/api`
- **認証方式**: NextAuth.js (JWT, ブラウザメモリ)
- **HTTP Client**: axios (クライアント側)
- **Content-Type**: `application/json`
- **Rate Limiting**: 3回までの試行制限（認証エンドポイント）
- **キャッシュ戦略**:
  - 一覧画面: DBキャッシュあり（差分更新方式）
  - 詳細画面: キャッシュなし（都度TMDb API取得）
- **言語設定**: 日本語のみ（ja-JP固定）
- **ページネーション**: 20件/ページ

---

## レスポンスフォーマット

### 成功レスポンス

```typescript
{
  success: true,
  data?: any,           // オプション: 返すデータがある場合
  message?: string      // オプション: ユーザー向けメッセージ
}
```

### エラーレスポンス（統一フォーマット）

```typescript
{
  success: false,
  error: {
    code: string,       // エラーコード（英大文字スネークケース）
    message: string,    // ユーザー向けエラーメッセージ（日本語）
    details?: any       // オプション: 追加情報（試行回数、フィールドエラー等）
  }
}
```

**エラーコード一覧:**

| HTTPステータス | エラーコード | message例 | details例 |
|--------------|------------|----------|----------|
| 400 | VALIDATION_ERROR | "入力内容に誤りがあります" | { fields: {...} } |
| 401 | UNAUTHORIZED | "認証が必要です" | - |
| 401 | INVALID_CREDENTIALS | "メールアドレスまたはパスワードが正しくありません" | - |
| 403 | FORBIDDEN | "アクセス権限がありません" | - |
| 404 | NOT_FOUND | "リソースが見つかりません" | - |
| 404 | USER_NOT_FOUND | "ユーザーが見つかりません" | - |
| 409 | CONFLICT | "すでに登録済みのメールアドレスです" | - |
| 429 | RATE_LIMIT_EXCEEDED | "試行回数の上限に達しました。30分後に再度お試しください" | { retryAfter: 1800 } |
| 429 | TOO_MANY_REQUESTS | "リクエストが多すぎます。しばらく待ってから再度お試しください" | - |
| 500 | INTERNAL_SERVER_ERROR | "サーバーエラーが発生しました" | - |
| 500 | DATABASE_ERROR | "データベースエラーが発生しました" | - |
| 503 | SERVICE_UNAVAILABLE | "サービスが一時的に利用できません" | - |

**エラーレスポンス例:**

```json
// バリデーションエラー
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容に誤りがあります",
    "details": {
      "fields": {
        "email": "メールアドレスの形式が正しくありません",
        "password": "パスワードは8文字以上、英字（大文字・小文字）と数字を含む必要があります"
      }
    }
  }
}

// レート制限エラー
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "試行回数の上限に達しました。30分後に再度お試しください",
    "details": {
      "retryAfter": 1800,
      "lockedUntil": "2025-01-30T12:30:00.000Z"
    }
  }
}

```

---

## 認証API

### POST /api/auth/register
新規ユーザー登録

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "ユーザー名"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "登録が完了しました",
  "data": { "userId": "uuid-here" }
}
```

**Error Responses:**
- `400 Bad Request`: バリデーションエラー
- `409 Conflict`: すでに登録済みのメールアドレス

---

### POST /api/auth/login
ログイン

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "name": "ユーザー名",
    "avatar_url": "https://..."
  },
  "token": "jwt-token-or-session-id"
}
```

**Error Responses:**
- `401 Unauthorized`: メールアドレスまたはパスワードが間違っている

---

### POST /api/auth/logout
ログアウト

**Response (200 OK):**
```json
{
  "success": true,
  "message": "ログアウトしました"
}
```

---

### POST /api/user/change-password
パスワード変更（ログイン済みユーザー）

**認証**: NextAuth.jsセッション必須

**Request Body:**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

**Validation:**
- パスワード: 8文字以上、英字（大文字・小文字）+ 数字必須（react-hook-form + zodで検証）

**Response (200 OK):**
```json
{
  "success": true,
  "message": "パスワードを変更しました"
}
```

**Error Responses:**
- `401 Unauthorized`: 未ログイン
- `400 Bad Request`: 現在のパスワードが間違っている
- `400 Bad Request`: 新しいパスワードがポリシー違反

---

## 映画API

### GET /api/movies
映画一覧取得（ソート可能、DBキャッシュ使用）

**Query Parameters:**
- `page` (optional): ページ番号（デフォルト: 1）
- `limit` (optional): 取得件数（デフォルト: 20）
- `sort_by` (optional): ソート順（デフォルト: release_date）
  - `release_date`: 公開日順（新しい順）
  - `popularity`: 人気順（高い順）
  - `vote_average`: 評価順（高い順）

**内部処理フロー:**
1. DBから最新映画の取得日時を確認 (`SELECT MAX(cached_at) FROM movie_cache`)
2. その日時以降の新作のみTMDb API（`/discover/movie`）で取得
   - `primary_release_date.gte`: MAX(cached_at)の日付
   - `primary_release_date.lte`: 今日から3ヶ月先
   - `language=ja-JP`, `region=JP`
3. 取得した新作をDBに追加（UPSERT）
4. DBから指定ページの映画を返却（sort_byパラメータに応じてソート）

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "movies": [
      {
        "id": 12345,
        "title": "映画タイトル",
        "title_ja": "日本語タイトル",
        "overview": "概要",
        "release_date": "2025-01-29",
        "poster_path": "/path/to/poster.jpg",
        "vote_average": 8.5,
        "popularity": 123.45
      }
    ],
    "pagination": {
      "page": 1,
      "total_pages": 10,
      "total_results": 200
    }
  }
}
```

---

### GET /api/movies/:id
映画詳細取得（キャッシュなし、都度TMDb API取得）

**内部処理フロー:**
1. TMDb API（`/movie/{movie_id}`）を直接呼び出し
2. 詳細情報（runtime, genres, cast, crew, videos等）を取得
3. リアルタイム情報をそのまま返却

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 12345,
    "title": "映画タイトル",
    "title_ja": "日本語タイトル",
    "overview": "概要",
    "release_date": "2025-01-29",
    "runtime": 120,
    "genres": [
      { "id": 28, "name": "アクション" }
    ],
    "poster_path": "/path/to/poster.jpg",
    "backdrop_path": "/path/to/backdrop.jpg",
    "vote_average": 8.5,
    "vote_count": 1000,
    "popularity": 123.45
  }
}
```

**Error Responses:**
- `404 Not Found`: 映画が見つからない

---

### GET /api/movies/search
映画検索（フィルタリング対応、キャッシュなし、都度TMDb API取得）

**Query Parameters:**
- `query` (required): 検索キーワード
- `page` (optional): ページ番号（デフォルト: 1）
- `genre` (optional): ジャンルID（カンマ区切りで複数指定可: `28,12`）
- `year` (optional): 公開年（YYYY形式: `2024`）
- `vote_average_gte` (optional): 最低評価（0-10: `7.0`）

**内部処理フロー:**
1. TMDb API（`/search/movie` + `/discover/movie`）を呼び出し
2. フィルターパラメータをTMDb APIに渡す
   - `with_genres`: ジャンルフィルター
   - `primary_release_year`: 年代フィルター
   - `vote_average.gte`: 評価フィルター
3. 検索結果をそのまま返却（DBには保存しない）

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "movies": [ /* 映画一覧と同じ形式 */ ],
    "pagination": { /* ページネーション情報 */ }
  }
}
```

---

## ウォッチリストAPI

### GET /api/watchlist
ユーザーのウォッチリスト取得（カーソルベースページング）

**認証**: 必須

**ページング方式**: カーソルベース（added_at基準）
- ウォッチリストは追加・削除が頻繁に発生するため、オフセットベースだとページずれが起きる
- added_at（降順）をカーソルとして使用し、安定したページングを実現

**Query Parameters:**
- `cursor` (optional): カーソル値（前回レスポンスのnext_cursor、ISO 8601形式）
- `limit` (optional): 取得件数（デフォルト: 20、最大: 50）

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "watchlist": [
      {
        "id": "watchlist-uuid",
        "tmdb_movie_id": 12345,
        "title": "映画タイトル",
        "poster_path": "/path/to/poster.jpg",
        "release_date": "2025-01-29",
        "added_at": "2025-01-29T10:00:00Z"
      }
    ],
    "next_cursor": "2025-01-28T15:00:00Z",
    "has_more": true
  }
}
```

**備考:**
- `next_cursor` が `null` の場合、次ページなし（`has_more: false`）
- レスポンスは `added_at` 降順（新しい順）で固定

---

### GET /api/watchlist/calendar
カレンダー表示用ウォッチリスト取得（月別）

**認証**: 必須

**Query Parameters:**
- `month` (optional): 対象月（YYYY-MM形式、デフォルト: 当月）

**内部処理フロー:**
1. `month` パラメータをzodでバリデーション（YYYY-MM形式）
2. 指定月の1日〜末日の範囲で `release_date` フィルタ
3. `release_date` がNULLのレコードは除外
4. `deleted_at IS NULL` でフィルタ（論理削除済みを除外）
5. 日付をキーとしたマップ形式で返却

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "month": "2026-03",
    "movies": {
      "2026-03-15": [
        {
          "id": "watchlist-uuid",
          "tmdb_movie_id": 12345,
          "title": "映画タイトルA",
          "poster_path": "/path/to/poster.jpg",
          "release_date": "2026-03-15"
        }
      ],
      "2026-03-22": [
        {
          "id": "watchlist-uuid-2",
          "tmdb_movie_id": 67890,
          "title": "映画タイトルB",
          "poster_path": "/path/to/poster2.jpg",
          "release_date": "2026-03-22"
        }
      ]
    }
  }
}
```

**備考:**
- 該当月に映画がない場合、`movies` は空オブジェクト `{}`
- レスポンスはページングなし（1ヶ月分のウォッチリスト映画は少量の想定）

**Error Responses:**
- `400 Bad Request`: `month` パラメータの形式が不正
- `401 Unauthorized`: 認証が必要

---

### POST /api/watchlist
ウォッチリストに追加

**認証**: 必須

**Request Body:**
```json
{
  "tmdb_movie_id": 12345,
  "title": "映画タイトル",
  "poster_path": "/path/to/poster.jpg",
  "release_date": "2025-01-29"
}
```

**Validation (zod):**
- `tmdb_movie_id`: 正の整数、必須
- `title`: 文字列、必須
- `poster_path`: 文字列、任意
- `release_date`: 文字列（日付形式）、任意

**Response (201 Created):**
```json
{
  "success": true,
  "message": "ウォッチリストに追加しました",
  "data": {
    "id": "watchlist-uuid",
    "tmdb_movie_id": 12345,
    "title": "映画タイトル",
    "poster_path": "/path/to/poster.jpg",
    "release_date": "2025-01-29",
    "added_at": "2025-01-29T10:00:00Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: バリデーションエラー
- `401 Unauthorized`: 認証が必要
- `409 Conflict`: すでにウォッチリストに追加済み

---

### DELETE /api/watchlist/:id
ウォッチリストから削除（論理削除）

**認証**: 必須

**削除方式**: 論理削除
- `deleted_at`カラムに現在時刻を設定
- 物理削除は行わない（復元・分析用にデータ保持）

**Response (200 OK):**
```json
{
  "success": true,
  "message": "ウォッチリストから削除しました"
}
```

**Error Responses:**
- `401 Unauthorized`: 認証が必要
- `404 Not Found`: ウォッチリストに見つからない、または既に削除済み

---

## バッチ更新API

### GET /api/cron/update-movies
映画キャッシュのバッチ更新（1日1回実行）

**認証**: Vercel Cron Secret（`Authorization: Bearer <CRON_SECRET>`）

**内部処理フロー:**
1. DBから全映画IDを取得
2. 100件ずつバッチでTMDb API（`/movie/{movie_id}`）から最新情報取得
3. `vote_average`, `popularity` を更新
4. `updated_at` を現在時刻に更新

**Response (200 OK):**
```json
{
  "success": true,
  "message": "映画キャッシュを更新しました",
  "updated_count": 1234
}
```

**Error Responses:**
- `401 Unauthorized`: Cron Secretが無効
- `500 Internal Server Error`: バッチ更新に失敗

**実行スケジュール:**
- Vercel Cron Jobs: 毎日午前3時（JST）

---

## ユーザー設定API

### PUT /api/user/profile
表示名更新

**認証**: NextAuth.jsセッション必須

**Request Body:**
```json
{
  "name": "新しい表示名"
}
```

**Validation (zod):**
- name: 1〜100文字、空白のみ不可

**Response (200 OK):**
```json
{
  "success": true,
  "message": "プロフィールを更新しました"
}
```

**Error Responses:**
- `401 Unauthorized`: 未ログイン
- `400 Bad Request`: バリデーションエラー

---

### GET /api/user/settings
ユーザー設定取得

**認証**: NextAuth.jsセッション必須

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "theme": "light",
    "notificationEnabled": false
  }
}
```

**備考:** 設定未作成時はデフォルト値を返却

---

### PUT /api/user/settings
ユーザー設定更新

**認証**: NextAuth.jsセッション必須

**Request Body:**
```json
{
  "theme": "dark",
  "notificationEnabled": true
}
```

**Validation (zod):**
- theme: 'light' | 'dark'（optional）
- notificationEnabled: boolean（optional）

**Response (200 OK):**
```json
{
  "success": true,
  "message": "設定を更新しました"
}
```

**Error Responses:**
- `401 Unauthorized`: 未ログイン
- `400 Bad Request`: バリデーションエラー

---

## 将来的なAPI

### レビュー機能

#### GET /api/movies/:id/reviews
映画のレビュー一覧取得

**Query Parameters:**
- `page` (optional): ページ番号（デフォルト: 1）
- `limit` (optional): 取得件数（デフォルト: 10）

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "id": "review-uuid",
        "user": {
          "id": "user-uuid",
          "name": "ユーザー名",
          "avatar_url": "https://..."
        },
        "rating": 4.5,
        "comment": "素晴らしい映画でした！",
        "created_at": "2026-01-29T10:00:00Z"
      }
    ],
    "pagination": { /* ページネーション情報 */ }
  }
}
```

#### POST /api/movies/:id/reviews
映画にレビューを投稿

**認証**: 必須

**Request Body:**
```json
{
  "rating": 4.5,
  "comment": "素晴らしい映画でした！"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "レビューを投稿しました",
  "data": {
    "id": "review-uuid",
    "rating": 4.5,
    "comment": "素晴らしい映画でした！",
    "created_at": "2026-01-29T10:00:00Z"
  }
}
```

---

### OpenAIレコメンド機能

#### POST /api/recommendations
AIによるおすすめ映画取得

**認証**: 必須

**Request Body:**
```json
{
  "count": 5
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "movie": { /* 映画詳細 */ },
        "reason": "あなたが好きな〇〇に似ているため"
      }
    ]
  }
}
```

---

## 確認が必要な事項

### 認証・セキュリティ
- [x] **認証方式**: NextAuth.js (JWT, ブラウザメモリ) - 確定
- [x] **Rate Limiting**: 3回までの試行制限 - 確定
- [x] **セッションの有効期限**: 24時間 - 確定
- [x] **セッションストレージ**: ブラウザメモリ（JWT方式） - 確定

### TMDb API
- [x] **API Key管理**: 環境変数（.env）で管理 - 確定
- [x] **キャッシュ戦略**: 一覧はDBキャッシュ（差分更新）、詳細/検索はキャッシュなし - 確定
- [x] **言語設定**: 日本語のみ（ja-JP固定） - 確定
- [x] **初回取得範囲**: 今日から3ヶ月先 - 確定
- [x] **バッチ更新**: 1日1回、全件の評価・人気度を更新 - 確定
- [x] **ページネーション**: 20件/ページ - 確定
- [x] **画像URL**: クライアント側で生成 - 確定
  - ベースURL: `NEXT_PUBLIC_TMDB_IMAGE_BASE_URL`（環境変数）
  - サイズ指定: コンポーネントで柔軟に指定（w500, w780, original等）
  - 生成例: `${NEXT_PUBLIC_TMDB_IMAGE_BASE_URL}/w500${poster_path}`
- [ ] **Cron Secret**: Vercel Cron Jobs用のシークレットキーは？

### エラーハンドリング
- [x] **統一エラーフォーマット**: 確定
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "メールアドレスの形式が不正です",
      "details": []
    }
  }
  ```
- [x] **エラーログ**: トースト表示（5秒間） - 確定
  - クライアント側でトーストコンポーネント使用
  - 自動消滅時間: 5秒
  - エラーの種類に応じて色分け（error, warning, info）

### パフォーマンス
- [x] **ページネーション**: 20件/ページ - 確定
- [x] **画像最適化**: Next.js Image使用 - 確定

### 将来的な拡張
- [x] **ソート順**: 公開日順・人気順・評価順 - 確定（セレクトボタンで切り替え）
- [x] **レビュー機能**: 機能のみ実装予定（将来拡張用）
- [x] **フィルタリング**: 検索機能に統合 - 確定
  - ジャンルフィルター（複数選択可）
  - 年代フィルター（公開年）
  - 評価フィルター（最低評価）
