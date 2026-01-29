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
  "message": "OTPをメールに送信しました",
  "userId": "uuid-here"
}
```

**Error Responses:**
- `400 Bad Request`: バリデーションエラー
- `409 Conflict`: すでに登録済みのメールアドレス

---

### POST /api/auth/verify-otp
OTP検証

**Request Body:**
```json
{
  "userId": "uuid-here",
  "otp": "123456"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "認証に成功しました",
  "token": "jwt-token-or-session-id"
}
```

**Error Responses:**
- `400 Bad Request`: OTPが無効または期限切れ
- `404 Not Found`: ユーザーが見つからない

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
- `403 Forbidden`: メール認証が未完了

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

## 映画API

### GET /api/movies
映画一覧取得（公開日順、DBキャッシュ使用）

**Query Parameters:**
- `page` (optional): ページ番号（デフォルト: 1）
- `limit` (optional): 取得件数（デフォルト: 20）

**内部処理フロー:**
1. DBから最新映画の取得日時を確認 (`SELECT MAX(cached_at) FROM movie_cache`)
2. その日時以降の新作のみTMDb API（`/discover/movie`）で取得
   - `primary_release_date.gte`: MAX(cached_at)の日付
   - `primary_release_date.lte`: 今日から3ヶ月先
   - `language=ja-JP`, `region=JP`
3. 取得した新作をDBに追加（UPSERT）
4. DBから指定ページの映画を返却

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
映画検索（キャッシュなし、都度TMDb API取得）

**Query Parameters:**
- `query` (required): 検索キーワード
- `page` (optional): ページ番号（デフォルト: 1）

**内部処理フロー:**
1. TMDb API（`/search/movie`）を直接呼び出し
2. 検索結果をそのまま返却（DBには保存しない）

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
ユーザーのウォッチリスト取得

**認証**: 必須

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "watchlist": [
      {
        "id": "watchlist-uuid",
        "tmdb_movie_id": 12345,
        "added_at": "2025-01-29T10:00:00Z",
        "movie": {
          "id": 12345,
          "title": "映画タイトル",
          "poster_path": "/path/to/poster.jpg",
          "release_date": "2025-01-29"
        }
      }
    ]
  }
}
```

---

### POST /api/watchlist
ウォッチリストに追加

**認証**: 必須

**Request Body:**
```json
{
  "tmdb_movie_id": 12345
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "ウォッチリストに追加しました",
  "data": {
    "id": "watchlist-uuid",
    "tmdb_movie_id": 12345,
    "added_at": "2025-01-29T10:00:00Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: 認証が必要
- `409 Conflict`: すでにウォッチリストに追加済み

---

### DELETE /api/watchlist/:id
ウォッチリストから削除

**認証**: 必須

**Response (200 OK):**
```json
{
  "success": true,
  "message": "ウォッチリストから削除しました"
}
```

**Error Responses:**
- `401 Unauthorized`: 認証が必要
- `404 Not Found`: ウォッチリストに見つからない

---

## バッチ更新API

### POST /api/cron/update-movies
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

## 将来的なAPI（OpenAIレコメンド機能）

### POST /api/recommendations
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
- [ ] **画像URL**: TMDb画像ベースURLの管理方法は？
- [ ] **Cron Secret**: Vercel Cron Jobs用のシークレットキーは？

### エラーハンドリング
- [ ] **統一エラーフォーマット**: 決定しているか？
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
- [ ] **エラーログ**: どこに出力するか？

### パフォーマンス
- [x] **ページネーション**: 20件/ページ - 確定
- [ ] **画像最適化**: Next.js Image APIを使うか？

### 将来的な拡張
- [ ] **ソート順**: 公開日順以外に人気順・評価順は必要？
- [ ] **フィルタリング**: ジャンル・年代などのフィルターは必要？
- [ ] **レビュー機能**: ユーザーレビューAPIは必要？
