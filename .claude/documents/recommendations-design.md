# AIレコメンド機能 設計書

## 概要

ユーザーのお気に入り映画（評価付き）をOpenAI APIに渡し、おすすめ映画10件を推測・提案する機能。

- **入力**: お気に入り映画（タイトル + 評価1〜10点）
- **出力**: おすすめ映画10件（タイトル + 推薦理由）
- **除外**: 既にお気に入り/ウォッチリストに登録済みの映画
- **更新頻度**: 日次Cron（1日1回）
- **表示**: ホームページにMovieTileで10件表示

## データフロー

```
[日次Cron]
  1. Supabase: お気に入り0件のユーザーをスキップ
  2. Supabase: お気に入り（タイトル + 評価）取得
  3. Supabase: 除外リスト取得（お気に入り + ウォッチリストの tmdb_movie_id）
  4. OpenAI API: おすすめ映画10件を推測（タイトル + 公開年 + 理由）
  5. TMDb Search API: タイトル + 公開年で検索 → tmdb_movie_id 取得
  6. 除外リストと照合 → 該当があればスキップ
  7. Supabase: recommendations テーブルに保存（既存レコード削除 → 新規挿入）

[ホーム表示時]
  1. GET /api/recommendations → Supabase から自分の recommendations 取得
  2. フロントで MovieTile 10件表示
  3. お気に入り0件 → 登録促進テキスト表示
```

## DB設計

### recommendations テーブル

```sql
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  release_date DATE,
  vote_average NUMERIC(3,1),
  genre_ids INTEGER[],
  reason TEXT NOT NULL,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 10),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_recommendations_user_order UNIQUE (user_id, display_order),
  CONSTRAINT uq_recommendations_user_movie UNIQUE (user_id, tmdb_movie_id)
);

CREATE INDEX idx_recommendations_user_id ON recommendations (user_id);
```

**特徴**:
- 論理削除なし（日次で全件入れ替えるため）
- `display_order` で表示順序を管理（1〜10）
- UNIQUE制約で同一ユーザーに同じ映画が重複しないことを保証

### RLSポリシー

```sql
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分のレコメンドのみ参照可能
CREATE POLICY "Users can view own recommendations"
  ON recommendations FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: service_role のみ（Cron API経由）
-- RLSでユーザーからの直接操作は不可
```

## API設計

### GET /api/recommendations（レコメンド取得）

**認証**: NextAuth.js セッション必須

**レスポンス（200 OK）**:
```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "id": "uuid",
        "tmdb_movie_id": 12345,
        "title": "映画タイトル",
        "poster_path": "/path.jpg",
        "release_date": "2024-01-01",
        "vote_average": 7.5,
        "genre_ids": [28, 12],
        "reason": "お気に入りの○○と同じ監督の作品で...",
        "display_order": 1
      }
    ],
    "generated_at": "2026-03-13T03:00:00Z"
  }
}
```

**レスポンス（お気に入り0件 or レコメンド未生成）**:
```json
{
  "success": true,
  "data": {
    "recommendations": [],
    "generated_at": null
  }
}
```

### GET /api/cron/generate-recommendations（日次Cron）

**認証**: Bearer Token（CRON_SECRET）

**処理フロー**:
1. お気に入りが1件以上あるユーザーを取得
2. ユーザーごとに以下を実行:
   a. お気に入り映画リスト取得（タイトル + 評価）
   b. 除外リスト取得（お気に入り + ウォッチリストの tmdb_movie_id）
   c. OpenAI API呼び出し（プロンプト + お気に入りリスト）
   d. レスポンスをパース（タイトル + 公開年 + 理由 × 10件）
   e. 各タイトルをTMDb Search APIで検索 → tmdb_movie_id, poster_path, release_date, vote_average, genre_ids 取得
   f. 除外リストと照合 → 該当映画をスキップ
   g. 既存レコメンドを DELETE → 新規 INSERT（トランザクション）

**レスポンス（200 OK）**:
```json
{
  "success": true,
  "data": {
    "processed_users": 5,
    "skipped_users": 2,
    "total_recommendations": 48
  }
}
```

**エラーハンドリング**:
- OpenAI APIエラー: 該当ユーザーをスキップし、既存レコメンドを維持
- TMDb検索で見つからない映画: スキップ（10件未満になる可能性あり）
- 1ユーザーの失敗が他ユーザーに影響しないよう、ユーザー単位でtry-catch

## OpenAI プロンプト設計

### モデル

- デフォルト: `gpt-4o-mini`（コスト効率重視）
- 環境変数 `OPENAI_MODEL` で変更可能

### システムプロンプト

```
あなたは映画レコメンドAIです。
ユーザーのお気に入り映画と評価（1〜10点）を分析し、そのユーザーが好みそうな映画を10件推薦してください。

ルール:
- 除外リストにある映画は絶対に推薦しないこと
- 実在する映画のみ推薦すること
- ジャンル、監督、テーマ、雰囲気などの傾向を分析して推薦すること
- 評価が高い映画の傾向をより重視すること
- 推薦理由は日本語で1〜2文で簡潔に書くこと

レスポンスは以下のJSON形式で返してください:
{
  "recommendations": [
    {
      "title": "映画の原題または最も一般的なタイトル",
      "year": 2024,
      "reason": "推薦理由"
    }
  ]
}
```

### ユーザープロンプト

```
## お気に入り映画
- インターステラー (2014) - 評価: 9/10
- ブレードランナー 2049 (2017) - 評価: 8/10
- ...

## 除外リスト（これらの映画は推薦しないでください）
- インターステラー
- ブレードランナー 2049
- ...（お気に入り + ウォッチリストのタイトル）
```

### レスポンスパース

- `response_format: { type: "json_object" }` でJSON出力を強制
- zodスキーマでバリデーション
- パース失敗時はそのユーザーをスキップ

## 環境変数

```bash
# OpenAI
OPENAI_API_KEY=sk-...          # OpenAI APIキー
OPENAI_MODEL=gpt-4o-mini       # 使用モデル（オプション、デフォルト: gpt-4o-mini）
```

## フロント設計

### ホームページ統合

```
ホームページ
├── 既存コンテンツ（タブ・ソート・映画グリッド）
└── RecommendationSection（新規）
    ├── お気に入り0件 → 登録促進テキスト
    ├── レコメンド未生成 → 「準備中」テキスト
    └── レコメンドあり → MovieTile × 10件グリッド表示
```

### コンポーネント

#### RecommendationSection
- ホームページ内に配置（既存コンテンツの上 or 下 — 実装時に決定）
- セクション見出し（例: 「あなたへのおすすめ」）
- MovieTileで10件グリッド表示
- 各タイルクリックで MovieDetailModal 表示
- React.memo + displayName 必須

#### 状態分岐
| 条件 | 表示 |
|---|---|
| お気に入り0件 | 「お気に入りを登録すると、AIがおすすめ映画を提案します」 |
| お気に入りあり + レコメンド未生成 | 「おすすめ映画を準備中です」 |
| レコメンドあり | MovieTile × 10件 |

### カスタムフック

#### useRecommendations
- TanStack Query（useQuery）でレコメンド取得
- `staleTime`: 長め（日次更新のため、例: 1時間）
- ローディング・エラー状態管理

## 定数

```typescript
// lib/constants/recommendations.ts
export const RECOMMENDATIONS = {
  MAX_COUNT: 10,
  QUERY_KEY: ['recommendations'],
  STALE_TIME: 60 * 60 * 1000, // 1時間
} as const;

export const RECOMMENDATIONS_MESSAGES = {
  NO_FAVORITES: 'お気に入りを登録すると、AIがおすすめ映画を提案します',
  NOT_GENERATED: 'おすすめ映画を準備中です',
  SECTION_TITLE: 'あなたへのおすすめ',
  GENERATION_ERROR: 'レコメンド生成中にエラーが発生しました',
} as const;
```

## テスト方針（テスティングトロフィーモデル）

### 単体テスト
- zodスキーマテスト（OpenAIレスポンスのパース）
- APIクライアントテスト（getRecommendations）
- 定数テスト

### 結合テスト
- API Routeテスト（GET /api/recommendations）
  - 認証チェック
  - 正常取得（レコメンドあり / なし）
- Cron APIテスト（GET /api/cron/generate-recommendations）
  - CRON_SECRET認証
  - OpenAI APIモック → 正常処理
  - TMDb検索モック → 映画情報取得
  - 除外ロジック（お気に入り/ウォッチリスト重複除外）
  - エラーハンドリング（OpenAI失敗時スキップ）
- useRecommendationsフックテスト
- RecommendationSectionテスト
  - お気に入り0件 → 登録促進テキスト
  - レコメンド未生成 → 準備中テキスト
  - レコメンドあり → MovieTile表示

### E2Eテスト
- ホームページでレコメンドセクション表示確認
- レコメンド映画タイルクリック → 詳細モーダル表示

## コスト見積もり

### OpenAI API（gpt-4o-mini）
- 入力: お気に入り10件 + 除外リスト ≒ 500トークン程度
- 出力: 10件のレコメンド ≒ 800トークン程度
- 1ユーザーあたり: 約 $0.0002〜$0.0005/回
- 10ユーザー × 日次 = 約 $0.06〜$0.15/月

### TMDb API
- 1ユーザーあたり10件検索 = 10リクエスト
- TMDbレート制限: 50req/s（余裕あり）

### Vercel Cron
- Hobbyプラン: 1日1回のCronは無料枠内
- 関数タイムアウト: ユーザー数が多い場合は分割処理が必要（将来検討）
