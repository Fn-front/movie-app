# お気に入り機能 設計書

## 概要

映画をお気に入り登録し、ユーザー独自の点数（1〜10点、1点刻み）を付けられる機能。
ウォッチリスト（観たい映画）とは別に、「好きな映画」を管理する。

> **注記**: 実装時に `database-schema.md` と `api-specification.md` も合わせて更新すること。

---

## 1. データベース設計

### `favorites` テーブル

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主キー |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE | ユーザーID |
| tmdb_movie_id | INTEGER | NOT NULL | TMDb映画ID |
| title | VARCHAR(255) | NOT NULL | 映画タイトル |
| poster_path | VARCHAR(255) | | ポスター画像パス |
| release_date | DATE | | 公開日 |
| rating | INTEGER | NOT NULL, CHECK (rating >= 1 AND rating <= 10) | ユーザー評価（1〜10点） |
| added_at | TIMESTAMP | NOT NULL, DEFAULT now() | 登録日時 |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT now() | 更新日時（トリガーで自動更新） |
| deleted_at | TIMESTAMP | | 論理削除用 |

### トリガー

既存テーブル（users, movie_cache, reviews等）と同様に、`update_updated_at_column()` トリガーを適用する。
rating更新時に `updated_at` が自動で `now()` に更新される。

```sql
CREATE TRIGGER update_favorites_updated_at
  BEFORE UPDATE ON favorites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### インデックス

- `UNIQUE (user_id, tmdb_movie_id) WHERE deleted_at IS NULL` — 重複防止
- `idx_favorites_user_id (user_id)` — ユーザー別一覧取得用

### RLSポリシー

既存watchlistテーブルと同じパターン。SELECTで `deleted_at IS NULL` をRLS側でフィルタする。

- SELECT: `auth.uid() = user_id AND deleted_at IS NULL`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id`
- DELETE: `auth.uid() = user_id`

### 上限数について

現時点では上限を設けない。後からINSERTポリシーに以下を追加することで制限可能：

```sql
(SELECT count(*) FROM favorites WHERE user_id = auth.uid() AND deleted_at IS NULL) < N
```

---

## 2. API設計

既存の統一レスポンス形式に準拠。

### `GET /api/favorites` — お気に入り一覧取得

**認証:** 必須（NextAuth.js セッション）

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| sort_by | string | `added_at` | ソート対象（`added_at` / `rating`） |
| sort_order | string | `desc` | ソート順（`asc` / `desc`） |
| page | number | `1` | ページ番号 |
| limit | number | `20` | 取得件数（既存APIと統一） |

**レスポンス:**

```json
{
  "success": true,
  "data": {
    "favorites": [
      {
        "id": "uuid",
        "tmdb_movie_id": 12345,
        "title": "映画タイトル",
        "poster_path": "/abc.jpg",
        "release_date": "2026-04-01",
        "rating": 8,
        "added_at": "2026-03-10T00:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 20
  }
}
```

### `POST /api/favorites` — お気に入り追加

**リクエストボディ:**

```json
{
  "tmdb_movie_id": 12345,
  "title": "映画タイトル",
  "poster_path": "/abc.jpg",
  "release_date": "2026-04-01",
  "rating": 8
}
```

**バリデーション（zod）:**

- `tmdb_movie_id`: 正の整数、必須
- `title`: 文字列、必須
- `rating`: 1〜10の整数、必須
- `poster_path`: 文字列、任意
- `release_date`: 文字列（日付形式）、任意

**エラー:**

- `409 CONFLICT` — 既にお気に入り登録済み

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "この映画は既にお気に入りに登録されています"
  }
}
```

### `PATCH /api/favorites/:id` — 評価更新

**リクエストボディ:**

```json
{
  "rating": 7
}
```

**バリデーション（zod）:**

- `rating`: 1〜10の整数、必須

**エラー:**

- `400 VALIDATION_ERROR` — ratingが範囲外

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "評価は1〜10の整数で入力してください"
  }
}
```

- `404 NOT_FOUND` — 指定IDのお気に入りが存在しない、または他ユーザーのお気に入り

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "お気に入りが見つかりません"
  }
}
```

### `DELETE /api/favorites/:id` — お気に入り削除（論理削除）

**エラー:**

- `404 NOT_FOUND` — 指定IDのお気に入りが存在しない、または他ユーザーのお気に入り

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "お気に入りが見つかりません"
  }
}
```

---

## 3. 型定義

```typescript
// src/features/favorites/types.ts

export interface Favorite {
  id: string;
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  rating: number;        // 1 ~ 10
  added_at: string;
}

export interface FavoriteAddRequest {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  rating: number;        // 1 ~ 10
}

export interface FavoriteUpdateRequest {
  rating: number;        // 1 ~ 10
}
```

---

## 4. ディレクトリ構成

既存の `src/features/movies/` と同じ `component/` 階層パターンを採用。

```
src/features/favorites/
├── component/
│   ├── favoriteButton/
│   │   ├── favoriteButton.tsx          # MovieTile上のハートアイコン
│   │   ├── favoriteButton.module.scss
│   │   └── favoriteButton.test.tsx
│   ├── favoriteRatingModal/
│   │   ├── favoriteRatingModal.tsx     # 点数入力モーダル
│   │   ├── favoriteRatingModal.module.scss
│   │   └── favoriteRatingModal.test.tsx
│   ├── ratingIndicator/
│   │   ├── ratingIndicator.tsx         # 数値インジケーター（1〜10点）
│   │   ├── ratingIndicator.module.scss
│   │   └── ratingIndicator.test.tsx
│   └── favoriteList/
│       ├── favoriteList.tsx            # お気に入り一覧
│       ├── favoriteList.module.scss
│       └── favoriteList.test.tsx
├── hooks/
│   ├── useFavorites.ts                 # お気に入りCRUD + React Query
│   └── useFavorites.test.ts
├── types.ts
└── favoritesPage.tsx                   # お気に入りページ
```

> **補足**: `src/features/settings/` は直下にコンポーネントフォルダを配置するフラット構成だが、favorites は movies と同様にコンポーネント数が多くなるため `component/` 階層を採用する。

---

## 5. コンポーネント設計

### FavoriteButton

- MovieTile右上にハートアイコン（`FiHeart` / `FaHeart`）を配置
- 未登録: 白抜きハート → クリックでRatingModal表示
- 登録済み: 塗りつぶしハート（`$secondary-600` オレンジ）→ クリックで評価変更モーダル表示
- `event.stopPropagation()` でMovieTileのクリック（詳細モーダル）と干渉しない

### FavoriteRatingModal

- Radix UI Dialogベース
- 映画タイトル表示
- インジケーターで1〜10点を選択（1点刻み）
- 「登録」「キャンセル」ボタン
- 登録済みの場合は現在の評価を初期値にセット + 「削除」ボタン表示

### RatingIndicator

- 1〜10点の数値インジケーター表示
- インタラクティブモード（モーダル内）: クリックで評価選択
- 表示モード（一覧画面）: 読み取り専用で評価値を表示

### FavoriteList

- お気に入り一覧ページのメインコンテンツ
- MovieTileと同様のグリッドレイアウト
- 各タイルに評価値（RatingIndicator）を表示
- ソート: 登録日順 / 評価順

---

## 6. ルーティング・ナビゲーション

- **新規ルート:** `/favorites`
- **ROUTES定数に追加:** `FAVORITES: '/favorites'`
- **SideNavに追加:** 「公開中」の下に「お気に入り」を配置

---

## 7. お気に入り状態チェック方式

### 方針: 映画一覧APIのレスポンスに含める

お気に入り状態の判定は、別途お気に入り全件を取得するのではなく、**映画一覧API（GET /api/movies）のレスポンスに各映画のお気に入り情報を含める**方式を採用する。

### GET /api/movies レスポンス変更

認証済みユーザーの場合、各映画に `favorite` フィールドを追加する。

```json
{
  "success": true,
  "data": {
    "movies": [
      {
        "id": 12345,
        "title": "映画タイトル",
        "poster_path": "/abc.jpg",
        "favorite": { "id": "favorite-uuid", "rating": 8 }
      },
      {
        "id": 67890,
        "title": "別の映画",
        "poster_path": "/def.jpg",
        "favorite": null
      }
    ]
  }
}
```

- `favorite` が `null` → 未登録（白抜きハート）
- `favorite` がオブジェクト → 登録済み（塗りつぶしハート、`id` は更新/削除用、`rating` は表示用）
- 未認証の場合は `favorite` フィールドを含めない

### API実装

映画一覧取得時に、認証済みであれば `favorites` テーブルを LEFT JOIN し、該当ユーザーの `favorite.id` と `favorite.rating` を付与する。

```sql
SELECT mc.*, f.id AS favorite_id, f.rating AS favorite_rating
FROM movie_cache mc
LEFT JOIN favorites f
  ON f.tmdb_movie_id = mc.id
  AND f.user_id = :userId
  AND f.deleted_at IS NULL
WHERE ...
```

### 映画詳細API（GET /api/movies/:id）も同様

詳細モーダルでもお気に入り状態を表示するため、映画詳細APIにも `favorite` フィールドを追加する。

### メリット

- 追加リクエスト不要（映画一覧取得の1リクエストで完結）
- お気に入り件数が増えても全件取得の必要がない
- MovieTileのレンダリング時点でお気に入り情報が確定している

---

## 8. カスタムフック（useFavorites）

TanStack Query ベースで実装。

```typescript
export const useFavorites = () => {
  // お気に入り一覧取得（useQuery）— /favorites ページ用
  // お気に入り追加（useMutation + 楽観的更新）
  // 評価更新（useMutation）
  // お気に入り削除（useMutation + 楽観的更新）
  // ※ isInFavorites は映画一覧レスポンスの favorite フィールドで判定
};
```

**楽観的UI更新時のキャッシュ操作:**
- 追加: 映画一覧キャッシュ内の該当映画の `favorite` を `{ id: 'optimistic-xxx', rating }` に更新
- 削除: 映画一覧キャッシュ内の該当映画の `favorite` を `null` に更新
- 評価変更: 映画一覧キャッシュ内の該当映画の `favorite.rating` を更新

---

## 9. UIフロー

```
MovieTile上のハートアイコンをクリック（favoriteフィールドで状態判定）
  |
  +-- [未登録の場合]
  |     FavoriteRatingModal表示
  |       → 1〜10点で評価を選択
  |       → 「登録」クリック
  |       → POST /api/favorites
  |       → Toast「お気に入りに追加しました」
  |       → ハートが塗りつぶしに変化
  |
  +-- [登録済みの場合]
        FavoriteRatingModal表示（現在の評価がセット済み）
          → 評価変更 → 「更新」→ PATCH /api/favorites/:id
          → 「削除」→ DELETE /api/favorites/:id → Toast「お気に入りから削除しました」
```

---

## 10. reviewsテーブルとの評価スケール差異について

| 機能 | スケール | 型 | 用途 |
|---|---|---|---|
| reviews | 0.5〜5.0（DECIMAL） | DECIMAL(2,1) | 映画レビュー（将来実装） |
| favorites | 1〜10（INTEGER） | INTEGER | お気に入り評価（個人的な点数） |

reviewsはTMDbの評価スケール（10点満点の半分）に寄せた設計。favoritesはよりシンプルな10段階整数評価で、レビューとは用途が異なる。
