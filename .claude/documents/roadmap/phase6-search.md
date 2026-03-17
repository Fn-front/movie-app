**ステータス: 完了**

## フェーズ6: 検索機能（1週間）

### UXフロー
- Header SearchBarにキーワード入力 → Enter or 検索アイコンクリック → `/search?query=xxx` に遷移
- 検索結果ページでフィルター操作 → URLパラメータ更新 → 再検索
- URLで検索状態を管理（ブックマーク・共有可能）

### TMDb APIの使い分け
- **キーワードのみ**: TMDb `/search/movie` を使用
- **キーワード + フィルター**: TMDb `/search/movie` → サーバー側でフィルタリング（genre_ids・vote_average・release_dateで絞り込み）
- **フィルターのみ（キーワードなし）**: TMDb `/discover/movie` を使用（with_genres・vote_average.gte・primary_release_year をAPIパラメータとして渡す）
- **キーワードなし + フィルターなし**: 400エラー

### Step 1: ジャンルマスターデータ取得
- [x] TMDb API（`/genre/movie/list`）からジャンル一覧取得
  - 日本語ジャンル名取得（`language=ja`）
  - axiosでTMDb API呼び出し（既存tmdbClientを使用）

### Step 2: 検索API実装
- [x] 検索API実装（`GET /api/movies/search`）
  - パラメータ: query, page, genre, year, vote_average_gte
  - zodバリデーション
  - TMDb APIの使い分けロジック（上記参照）
  - サーバー側フィルタリング（キーワード + フィルター併用時）
  - サーバー側でAPIキー秘匿
  - 統一エラーレスポンス形式
- [x] ジャンル一覧API実装（`GET /api/movies/genres`）

### Step 3: SearchBarコンポーネント + Header配置
- [x] SearchBarコンポーネント実装
  - テキスト入力 + 検索アイコンボタン
  - Enter or アイコンクリックで `/search?query=xxx` にページ遷移
  - デバウンスなし（ページ遷移トリガーのため不要）
- [x] Headerへの配置

### Step 4: 検索結果ページ + SearchResultsコンポーネント
- [x] 検索結果ページ実装（`/app/search/page.tsx`）
  - Server Component
  - メタデータ設定
- [x] SearchResultsコンポーネント実装
  - 既存MovieTileを使用した検索結果一覧
  - 結果件数表示
  - 既存Paginationコンポーネント使用
  - 結果なし時のEmptyState表示
- [x] useSearchフック実装
  - useSearchParamsでURLパラメータ読み取り
  - axiosで `/api/movies/search` を呼び出し
  - ローディング・エラー状態管理
  - フィルター変更時にURL更新 + 再検索

### Step 5: MovieFilterコンポーネント + フィルタリング連携
- [x] MovieFilterコンポーネント実装
  - ジャンルマルチセレクト（Radix UI Checkbox群）
  - 年代ドロップダウン（Radix UI Select、2020〜現在+5年先）
  - 評価選択（Radix UI Select、0〜10、0.5刻み）
  - フィルタークリアボタン
  - フィルター変更 → URLパラメータ更新
- [x] useSearchフックとの連携

### Step 6: テスト
- [x] SearchBarコンポーネントテスト
  - Enter押下でページ遷移
  - 検索アイコンクリックでページ遷移
  - 空文字での検索防止
- [x] SearchResultsコンポーネントテスト
  - 検索結果の一覧表示
  - 結果件数表示
  - 結果なし時のEmptyState表示
  - ページネーション操作
- [x] MovieFilterコンポーネントテスト
  - ジャンル選択・解除
  - 年代選択
  - 評価選択
  - フィルタークリア
- [x] useSearchフックテスト
  - URLパラメータからの検索条件読み取り
  - API呼び出しとレスポンス処理
  - フィルター変更時のURL更新
- [x] 検索API Routeテスト
  - キーワード検索
  - フィルター検索
  - キーワード + フィルター併用
  - バリデーションエラー
