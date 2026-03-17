**ステータス: 完了**

## フェーズ8: 劇場公開中の人気映画表示

> TMDb Discover APIで日本で劇場公開中の人気映画を日次Cronで取得・DB保存し、ホームページに横スクロールで表示する。

### Step 1: DB・型定義・定数（`feature/trending-movies-db`）
- [x] `now_showing_movies`テーブル作成（Supabase migration）
  - UUID主キー、tmdb_movie_id、title、poster_path、release_date、vote_average、popularity、display_order（1〜10）、fetched_at（最終同期日時、デフォルト: now()）
  - UNIQUE制約（tmdb_movie_id）
  - RLSポリシー設定（SELECT: 全ユーザー、INSERT/UPDATE/DELETE: service_roleのみ）
  - インデックス（display_order）
- [x] Supabase CLIでマイグレーション実行（`supabase migration new` → `supabase db push`）
- [x] 劇場公開中映画用の型定義作成（`lib/types/index.ts`）
  - TMDb Discover APIレスポンス型（`TMDbNowShowingMovie`）
  - DBレコード型（`NowShowingMovie`）
- [x] 定数追加（`constants/nowShowing.ts`）
  - DISPLAY_COUNT（10）、QUERY_KEY、STALE_TIME
  - セクションタイトル等のメッセージ定数
- [x] 単体テスト

### Step 2: TMDb API取得ロジック + Cron API（`feature/trending-movies-cron`）
- [x] TMDb Discover APIクライアント関数作成（`lib/tmdb/tmdb.ts`）
  - `GET /discover/movie`（`with_release_type=2|3`, `release_date.gte/lte`, `sort_by=popularity.desc`）
  - レスポンスのパース・10件制限
- [x] Cron API実装（`GET /api/cron/sync-now-showing`）
  - CRON_SECRET認証
  - TMDb Discover APIから劇場公開中映画取得
  - `now_showing_movies`テーブルを全件洗い替え（RPC関数でDELETE → INSERT）
  - TMDb API取得成功後にのみDELETEを実行（失敗時は既存データを保持）
- [x] Vercel Cron設定（vercel.json）— 日次実行（`0 18 * * *`、毎日 JST AM3:00）
- [x] 単体テスト

### Step 3: カスタムフック（`feature/trending-movies-hook`）
- [x] `useNowShowingMovies`フック作成
  - React QueryでDBから劇場公開中映画データ取得
  - ローディング・エラー状態管理
- [x] 単体テスト

### Step 4: UIコンポーネント（`feature/trending-movies-ui`）
- [x] `MovieTile`共通コンポーネントを再利用（`NowShowingMovie` → `MovieCacheItem`変換）
- [x] `NowShowingMovieList`コンポーネント作成
  - 横スクロールレイアウト（10件横並び）
  - ランクバッジオーバーレイ
  - ローディング・エラー・空状態の表示
  - React.memo + displayName
- [x] SCSS Modules（横スクロール用スタイル）
  - デザインシステム変数使用
  - スクロールバースタイリング
- [x] 単体テスト

### Step 5: ホームページ統合（`feature/trending-movies-integration`）
- [x] ホームページに`NowShowingMovieList`セクション配置
- [x] 結合テスト

### 今後の検討事項
- [x] NowShowingMovieListのServer Component化（日次Cronデータのためクライアントフェッチ不要、RSC+Client分離でFCP改善）
