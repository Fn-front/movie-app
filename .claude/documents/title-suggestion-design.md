# AI原題提案機能 設計書

## 概要

邦題で映画を検索してヒットしない場合に、AIが原題を推測して提案する機能。

- **トリガー**: 検索実行時に検索APIと並行してAI提案APIを呼び出す
- **表示条件**: 検索結果が0件の場合のみ提案を表示
- **UI**: 「○○ですか？」のようにリンクで提案 → クリックで原題で再検索
- **キャッシュ**: 翻訳結果をDBに保存し、同じ邦題は再利用（AI呼び出しスキップ）

## データフロー

```
[検索実行時 — 並行処理]

  リクエスト1: GET /api/movies/search?query=邦題
    → TMDb検索 → 結果を返す

  リクエスト2: GET /api/movies/suggest-title?query=邦題（並行）
    → DBキャッシュ確認
      → ヒット: キャッシュから返す（高速）
      → ミス: OpenAI API → 原題推測 → DBに保存 → 返す

[フロント]
  検索結果0件 + 提案あり → 「○○ですか？」を表示
  検索結果あり → 提案は捨てる
  提案クリック → 原題で再検索（/search?query=原題）
```

## DB設計

### title_suggestions テーブル

```sql
CREATE TABLE title_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_title VARCHAR(255) NOT NULL,
  suggested_title VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_title_suggestions_query UNIQUE (query_title)
);

CREATE INDEX idx_title_suggestions_query ON title_suggestions (query_title);
```

**特徴**:
- 論理削除なし（キャッシュテーブルのため）
- `query_title` にUNIQUE制約（同じ邦題は1レコード）
- 認証不要（全ユーザー共有のキャッシュ）

### RLSポリシー

```sql
ALTER TABLE title_suggestions ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザーが参照可能
CREATE POLICY "Anyone can view title suggestions"
  ON title_suggestions FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: service_role のみ（API経由）
```

## API設計

### GET /api/movies/suggest-title（原題提案）

**認証**: NextAuth.js セッション必須

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| query | string | Yes | 検索キーワード（邦題） |

**処理フロー**:
1. `query` のバリデーション（1文字以上）
2. `title_suggestions` テーブルで `query_title = query` を検索
3. キャッシュヒット → そのまま返す
4. キャッシュミス → OpenAI APIに問い合わせ
5. OpenAIレスポンスをパース
6. 提案がある場合 → DBに保存 → 返す
7. 提案がない場合（原題と同じ等）→ 提案なしを返す

**レスポンス（200 OK — 提案あり）**:
```json
{
  "success": true,
  "data": {
    "suggestion": "The Shawshank Redemption",
    "cached": true
  }
}
```

**レスポンス（200 OK — 提案なし）**:
```json
{
  "success": true,
  "data": {
    "suggestion": null,
    "cached": false
  }
}
```

## OpenAI プロンプト設計

### モデル

- レコメンド機能と同じ設定（環境変数 `OPENAI_MODEL`、デフォルト: `gpt-4o-mini`）

### システムプロンプト

```
あなたは映画タイトルの翻訳エキスパートです。
ユーザーが入力した日本語の映画タイトル（邦題）に対して、対応する原題（英語タイトル）を回答してください。

ルール:
- 入力が既に原題（英語）の場合は null を返すこと
- 入力が映画タイトルと判断できない場合は null を返すこと
- 確信が持てない場合は null を返すこと
- 最も一般的に知られている原題を返すこと

レスポンスは以下のJSON形式で返してください:
{
  "suggested_title": "英語の原題" または null
}
```

### ユーザープロンプト

```
映画タイトル: ショーシャンクの空に
```

### レスポンスパース

- `response_format: { type: "json_object" }` でJSON出力を強制
- zodスキーマでバリデーション
- パース失敗時は提案なし（null）を返す

## 環境変数

追加なし（レコメンド機能で追加済みの `OPENAI_API_KEY` / `OPENAI_MODEL` を共用）

## フロント設計

### 検索結果ページの変更

```
SearchResults
├── 検索結果あり → 既存のMovieTileグリッド
└── 検索結果0件
    ├── TitleSuggestion（新規）
    │   ├── ローディング中 → スケルトン or 非表示
    │   ├── 提案あり → 「○○ですか？」リンク表示
    │   └── 提案なし → 非表示
    └── EmptyState（既存）
```

### コンポーネント

#### TitleSuggestion
- props: `suggestion: string | null`, `isLoading: boolean`
- 提案あり → 「**○○** ですか？」（リンク、クリックで `/search?query=原題` に遷移）
- 提案なし or ローディング中 → 非表示（EmptyStateのみ表示）
- React.memo + displayName 必須

### カスタムフック

#### useTitleSuggestion
- TanStack Query（useQuery）で提案API呼び出し
- 検索キーワードが変わるたびに再取得
- `enabled`: 検索キーワードが存在する場合のみ
- `staleTime`: 長め（キャッシュされているため）

### useSearch の変更

- `useTitleSuggestion` を内部で呼び出し
- 返り値に `suggestion` と `isSuggestionLoading` を追加

## 定数

```typescript
// lib/constants/search.ts に追加
export const TITLE_SUGGESTION = {
  QUERY_KEY: ['titleSuggestion'],
  STALE_TIME: 24 * 60 * 60 * 1000, // 24時間（DBキャッシュがあるため長め）
} as const;

export const TITLE_SUGGESTION_MESSAGES = {
  SUGGESTION_SUFFIX: 'ですか？',
} as const;
```

## テスト方針（テスティングトロフィーモデル）

### 単体テスト
- zodスキーマテスト（OpenAIレスポンスのパース）
- APIクライアントテスト（suggestTitle）

### 結合テスト
- API Routeテスト（GET /api/movies/suggest-title）
  - 認証チェック
  - キャッシュヒット → DB結果を返す
  - キャッシュミス → OpenAI呼び出し → DB保存 → 結果を返す
  - OpenAIが null を返す → 提案なし
  - OpenAIエラー → 提案なし
  - バリデーションエラー（query なし）
- useTitleSuggestionフックテスト
- TitleSuggestionコンポーネントテスト
  - 提案あり → 「○○ですか？」リンク表示
  - 提案なし → 非表示
  - ローディング中 → 非表示
- SearchResults統合テスト
  - 検索結果0件 + 提案あり → TitleSuggestion表示
  - 検索結果あり → TitleSuggestion非表示

### E2Eテスト
- 不要（結合テストで十分カバー可能）

## コスト見積もり

### OpenAI API（gpt-4o-mini）
- 入力: 邦題1つ ≒ 50トークン程度
- 出力: 原題1つ ≒ 30トークン程度
- 1リクエストあたり: 約 $0.00003
- キャッシュにより同じ邦題は2回目以降無料
- 月間コスト: ユニークな邦題検索数に依存（1,000回でも約 $0.03）
