**ステータス: 完了**

## フェーズ3: 映画情報表示（1-2週間）

### Step 1: ホーム画面レイアウト（`feature/home-layout`）
- [x] root layoutからl_global_container/l_main/l_containerラッパーを削除し簡素化
- [x] auth/settingsレイアウトをmin-height: 100vhでセンタリング対応
- [x] HomePageコンポーネント作成（AppLayout + Header/Sidebar/Footer）
- [x] page.tsxをHomePageに接続しMetadata設定

### Step 2: 映画一覧API + MovieTile + ソート + ページネーション（`feature/home-layout`）
- [x] TMDb APIクライアントにdiscoverMovies関数を追加
- [x] 映画一覧API（GET /api/movies）をDBキャッシュ経由で実装
- [x] 映画定数（SORT_OPTIONS, CACHE_DURATION_HOURS等）を追加
- [x] moviesQuerySchemaバリデーションを追加
- [x] APIクライアント（getMovies）を追加
- [x] MovieTile/MovieTileSkeletonコンポーネントを作成
- [x] HomePageにソートSelect・映画グリッド・Paginationを統合
- [x] useHomePageフックでデータ取得・状態管理を実装
- [x] スキーマ・APIクライアントのテストを追加

### Step 3: タブ切替 + ジャンル表示・フィルター（`feature/movie-tabs-filter`）
- [x] 劇場公開・ストリーミングのタブ切替を追加
- [x] MovieTileにジャンル表示を追加
- [x] ソートSelectの左にフィルターボタンを追加
- [x] ジャンルフィルターモーダルを作成（複数選択可）
- [x] テストを追加

### Step 4: 映画.com iCalフィードによるTMDbデータ補完（`feature/tmdb-integration`）
- [x] ical.js依存関係を追加
- [x] 映画.com iCalフィード定数を追加
- [x] iCal取得・パース処理を実装（src/lib/eiga/eiga.ts）
- [x] TMDb照合・DB補完ロジックを実装（src/lib/eiga/syncEigaMovies.ts）
- [x] Cron APIルートを実装（src/app/api/cron/sync-movies/route.ts）
- [x] Vercel Cron設定を追加（vercel.json）
- [x] テストを追加

### Step 5: フィルター条件保存機能（`feature/saved-filters`）
- [x] saved_filtersテーブルを作成（user_id, filter_conditions等）
- [x] RLSポリシー設定（ユーザーは自分のフィルターのみ操作可能）
- [x] フィルター保存API（PUT /api/filters）を実装
- [x] フィルター取得API（GET /api/filters）を実装
- [x] useHomeで初回読み込み時にフィルター自動適用・変更時に自動保存
- [x] テストを追加

### Step 6: サイドナビゲーション + 公開予定/公開中ページ分離（`feature/side-nav-movie-pages`）
- [x] サイドナビゲーション（SideNav）コンポーネントを作成
- [x] Sidebarにnavigationスロットを追加
- [x] Movies API に time_frame パラメータを追加（upcoming / now_showing）
- [x] /movies/upcoming ページ + upcomingドメイン（features/movies/upcoming）を作成
- [x] /movies/now-showing ページ + nowShowingドメイン（features/movies/nowShowing）を作成
- [x] 共有コンポーネントを features/movies/component/ に移動
- [x] features/home から共有コンポーネントを features/movies/component/ に移動（home自体は残す）
- [x] / は現状維持（リダイレクトなし）
- [x] テストを追加

### Step 7: React Strict Mode 有効化（`setup/strict-mode`）
- [x] next.config.mjs に `reactStrictMode: true` を追加
- [x] 開発環境でEffect二重実行による既存バグがないか確認・修正

### Step 8: TanStack Query 導入（`setup/tanstack-query`）
- [x] @tanstack/react-query をインストール
- [x] QueryClientProvider を設定
- [x] useMovieList を useQuery ベースにリファクタ（AbortController・競合状態・キャッシュを自動管理）
- [x] useHome の既存フェッチロジックを移行
- [x] getSavedFilter / saveFilter のフェッチを useQuery / useMutation に移行
- [x] テストを追加

### Step 9: ESLint カスタムルール追加（`setup/eslint-async-effect`）
- [x] useEffect 内の非同期処理にクリーンアップ関数がない場合の警告ルールを追加
- [x] 既存コードの違反を修正

### Step 10: 公開中ページを now_playing API に移行（`feature/now-playing-sync`）
- [x] movie_cache テーブルに is_now_playing カラムを追加
- [x] syncNowPlayingMovies ユーティリティを作成
- [x] /api/cron/sync-now-playing エンドポイントを作成
- [x] /api/movies の now_showing+theatrical ロジックを is_now_playing フラグに変更
- [x] vercel.json に日次 Cron を追加
- [x] useNowShowing フックを簡素化
- [x] Now Playing 比較ページを削除
- [x] テストを追加

### Step 11: E2Eテスト導入（`setup/e2e-test`）
- [x] Playwright設定の確認・調整（playwright.config.ts）
- [x] 認証用fixture作成（e2e/fixtures/auth.ts）
  - storageStateを使いログイン済みセッションを保存・再利用
- [x] テスト用ヘルパー作成（e2e/helpers/testUser.ts）
- [x] E2Eテスト作成
  - [x] 認証フロー（e2e/auth/signin.spec.ts, signup.spec.ts）
  - [x] 映画一覧 - 公開予定（e2e/movies/upcoming.spec.ts）
  - [x] 映画一覧 - 公開中（e2e/movies/nowShowing.spec.ts）
  - [x] サイドナビゲーション（e2e/navigation/sideNav.spec.ts）
  - [x] 設定ページ（e2e/settings/settings.spec.ts）
- [x] GitHub Actions E2Eワークフロー作成（.github/workflows/e2e.yml）
  - Next.jsビルド → サーバー起動 → Playwright実行
  - 失敗時にトレース・スクリーンショットをartifact保存
- [x] テストを追加

### Step 12: 無限スクロール導入（`feature/infinite-scroll`）
- [x] /api/movies のレスポンスにカーソルベースまたはoffsetベースのページング情報を追加
- [x] useMovieList を useInfiniteQuery（TanStack Query）に移行
- [x] /movies/upcoming のページネーションを無限スクロール（20件ずつ）に変更
- [x] /movies/now-showing のページネーションを無限スクロール（20件ずつ）に変更
- [x] スクロール検知コンポーネントまたはIntersection Observer実装
- [x] ローディングインジケーター（追加読み込み中）を表示
- [x] 既存Paginationコンポーネントの参照を削除
- [x] テストを追加

### Step 13: TMDbアトリビューション表示（`feature/tmdb-attribution`）
- [x] TMDb公式ロゴを取得し配置（自アプリロゴより小さく表示）
- [x] アトリビューション文言を表示（「This product uses the TMDB API but is not endorsed or certified by TMDB」）
- [x] フッターまたはAboutセクションにクレジットを配置
- [x] テストを追加

### Step 14: フィルター条件保存の不具合調査（`fix/saved-filters-investigation`）
- [x] 現在のフィルター保存・復元フローの動作確認
- [x] 保存されない条件の特定（ジャンル・日付範囲・リバイバル・ソート等）
- [x] API（GET/PUT /api/filters）のリクエスト・レスポンス検証
- [x] saved_filtersテーブルのデータ確認
- [x] 原因特定と修正方針の決定
- [x] 修正実装
- [x] テストを追加

### Step 15: E2Eテスト拡充（`setup/e2e-test-expand`）
- [x] ホームページ（`/`）のE2Eテスト追加
  - ページアクセス・コンテンツ表示確認
  - ソート・フィルター操作の動作確認
- [x] ログアウトのE2Eテスト追加
  - ログアウト操作後のリダイレクト確認
- [x] 未認証アクセス保護のE2Eテスト追加
  - `/movies/upcoming`、`/movies/now-showing`、`/` への未認証アクセス時のリダイレクト確認
- [x] 映画ページのソート・フィルター操作テスト追加
  - ソート変更の動作確認
  - ジャンルフィルター適用の動作確認
- [x] TMDbアトリビューション表示テスト追加
  - フッターのクレジット表示確認
- [x] ヘッダーのE2Eテスト追加
  - ヘッダー要素の表示確認

### Step 16: ユニットテスト拡充（`setup/unit-test-expand`）
- [x] 認証フォームのテスト追加
  - loginForm.tsx（フォーム表示・バリデーション・送信）
  - registerForm.tsx（フォーム表示・バリデーション・送信）
  - changePasswordForm.tsx（フォーム表示・バリデーション・送信）
- [x] API Routeのテスト追加
  - /api/auth/register/route.ts（正常登録・重複・バリデーションエラー）
  - /api/user/change-password/route.ts（正常変更・認証エラー・バリデーションエラー）
  - /api/movies/route.ts（クエリパラメータ・レスポンス形式）
  - /api/filters/route.ts（GET/PUT・認証チェック）
  - /api/cron/sync-movies/route.ts（認証・同期処理）
  - /api/cron/sync-now-playing/route.ts（認証・同期処理）
- [x] 共通UIコンポーネントのテスト追加
  - button.tsx（レンダリング・クリック・disabled・aria属性）
  - input.tsx（レンダリング・入力・バリデーション・aria属性）
  - select.tsx（レンダリング・選択・aria属性）
  - modal.tsx（開閉・オーバーレイクリック・Escape・aria属性）
  - toast.tsx（表示・自動非表示・aria属性）
  - card.tsx（レンダリング・children）
  - loading.tsx（表示・オーバーレイ・aria属性）
  - tabs.tsx（タブ切替・aria属性）
  - checkbox.tsx（チェック・aria属性）
- [x] APIクライアントのテスト追加
  - filters.ts（getSavedFilter・saveFilter）
- [x] useHomeフックのテスト追加
- [x] headerコンポーネントのテスト追加

### Step 17: 映画詳細モーダル（`feature/movie-detail-modal`）
- [x] 映画詳細API（GET /api/movies/:id）を実装
- [x] APIクライアントにgetMovieDetailを追加
- [x] useMovieDetailフックを作成
- [x] MovieDetailModalコンポーネントを作成
- [x] MovieDetailContentコンポーネントを作成（バックドロップ・ポスター・ジャンル・評価等）
- [x] HomePageにモーダル統合（MovieTileクリックで表示）
- [x] テストを追加

### Step 18: フィルター条件がリロードでリセットされる問題（`fix/filter-reset-on-reload`）
- [x] 原因調査
  - リロード時にTanStack Queryキャッシュが消えるため `savedFilterQuery.data` がundefinedから始まる
  - `useSession` の `loading` → `authenticated` 遷移中に `savedFilterQuery` が `enabled: false` でスキップされ、UIステートがデフォルト値のまま映画取得が走る
  - `buildFilterConditions` でデフォルト値と一致する条件を省略するため、`date_range_gte` 等のページ固有デフォルト値が保存されず復元できない
  - `saveFilter` の `onSuccess` で `invalidateQueries` → 再取得が走るが、`savedFilterApplied` refがtrueのため再適用されない
- [x] 修正方針の決定
- [x] 修正実装
- [x] テストを追加

### Step 19: バッチ更新API（`feature/batch-update-movies`）
- [x] Cron定数を追加
- [x] バッチ更新API（GET /api/cron/update-movies）を実装
- [x] Vercel Cron設定（vercel.json）を追加
- [x] .env.exampleにCRON_SECRETを追加
- [x] テストを追加
