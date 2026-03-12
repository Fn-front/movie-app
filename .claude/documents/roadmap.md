# 開発ロードマップ

## フェーズ1: 基盤構築（1-2週間）

### 環境セットアップ
- [x] Next.js 15プロジェクト作成
- [x] TypeScript設定
- [x] ESLint/Prettier設定
- [x] 必要なパッケージインストール
  - [x] Radix UI（@radix-ui/react-select, react-dialog, react-toast）
  - [x] React Icons
  - [x] react-hook-form + zod
  - [x] その他依存関係
- [x] 環境設定ファイルの作成
  - [x] .env.exampleテンプレート作成（環境変数の雛形）
  - [x] next.config.js設定（TMDb画像ドメイン許可、SCSS設定）
  - [x] エラーページ実装（app/error.tsx, app/not-found.tsx）
- [x] 基本設定・スタイリング方針確立
  - [x] SCSS Modules設定
  - [x] デザインシステムのSCSS変数作成
  - [x] 命名規則ドキュメント整備（lowerCamelCase）
  - [x] アクセシビリティ設定
    - [x] カラーコントラストWCAG AA基準確認
    - [x] フォーカス表示スタイル実装（outline: 2px solid $primary-500）
    - [x] レスポンシブ設定（最小幅375px、モバイルファースト）
- [x] 共通関数（ユーティリティ）の実装
  - [x] 画像URLユーティリティ（getTMDbImageUrl）
  - [x] 日付フォーマット関数（formatDate, formatDateTime）
  - [x] バリデーションヘルパー（isValidEmail, isValidPassword）
  - [x] エラーハンドリングヘルパー（handleApiError, formatErrorMessage）
  - [x] 文字列操作ヘルパー（truncate, capitalize）
- [x] 共通カスタムフックの実装
  - [x] useDebounce（入力遅延処理）
  - [x] useLocalStorage（ローカルストレージ管理）
  - [x] useMediaQuery（レスポンシブ判定）
  - [x] usePrevious（前回の値を保持）
  - [x] useClickOutside（外側クリック検知）
  - [x] useToggle（boolean状態管理）
- [x] lib（ライブラリ・設定）の実装
  - [x] Supabaseクライアント設定（lib/supabase/client.ts, server.ts）
  - [x] TMDb APIクライアント設定（lib/tmdb/tmdb.ts）
  - [x] axiosインスタンス設定（lib/axios/axios.ts）
  - [ ] NextAuth.js設定（lib/auth/authOptions.ts）
  - [x] 定数定義（lib/constants/index.ts）
  - [x] 型定義（lib/types/index.ts）
- [x] 共通コンポーネントの基礎実装（Radix UIベース、React.memo必須）
  - [x] Button（React.memo + aria-label）
  - [x] Input（フォーム統合、React.memo + aria-label）
  - [x] Select（@radix-ui/react-select、React.memo + aria-label）
  - [x] Card（React.memo）
  - [x] Modal（@radix-ui/react-dialog、React.memo + aria-label）
  - [x] Toast（@radix-ui/react-toast、5秒表示、React.memo + aria-label）
  - [x] Loading（全画面オーバーレイ対応、React.memo + aria-label）
  - [x] 全インタラクティブ要素にaria-label実装
- [ ] カスタムフック基礎実装
  - [x] useToast（トースト通知管理）
  - [ ] useAuth（認証状態管理）
  - [ ] useMovies（映画データ取得）
  - [ ] useWatchlist（ウォッチリスト操作）

### フェーズ1 単体テスト
- [x] カスタムフックのテスト
  - [x] useDebounce
  - [x] useLocalStorage
  - [x] useMediaQuery
  - [x] usePrevious
  - [x] useClickOutside
  - [x] useToggle
  - [x] useToast
- [x] ユーティリティのテスト
  - [x] date（formatDate, formatDateTime）
  - [x] error（handleApiError, formatErrorMessage）
  - [x] image（getTMDbImageUrl, getTMDbPosterUrl, getTMDbBackdropUrl）
  - [x] string（truncate, capitalize）
  - [x] validation（isValidEmail, isValidPassword）
- [x] Zustandストアユーティリティのテスト
  - [x] createStore
  - [x] createPersistStore
- [x] TMDb APIクライアントのテスト
  - [x] tmdb.ts（各APIメソッド、リトライ処理、ページバリデーション）

### データベース・認証基盤
- [x] **技術選定を確定**
  - [x] データベース: Supabase (PostgreSQL)
  - [x] ORM: Supabase SDK
  - [x] 状態管理: Zustand
  - [x] UIライブラリ: Radix UI（拡張してカスタマイズ）
  - [x] アイコン: React Icons
  - [x] 認証: NextAuth.js v5
  - [x] HTTP Client: axios
  - [x] フォームバリデーション: react-hook-form + zod
  - [x] レート制限: 3回
  - [x] ホスティング: Vercel
  - [x] CSRF対策: 厳し目の基本設定
  - [x] コード分割: しない
  - [x] Supabase Realtime: 使用しない
  - [x] Supabase Storage: 使用しない
  - [x] アニメーション: なし（opacity等のCSS transitionのみ）
  - [x] パフォーマンス: React.memo + useCallback必須適用
  - [x] 命名規則: lowerCamelCase
  - [x] テスト: Jest + React Testing Library + Playwright
- [x] Supabaseプロジェクト作成
  - [x] Supabaseアカウント作成
  - [x] 新規プロジェクト作成
  - [x] 接続情報取得（URL, ANON_KEY, SERVICE_ROLE_KEY）
- [x] NextAuth.js v5設定
  - [x] Credentials Providerセットアップ
  - [x] Supabaseとの統合（usersテーブル）
  - [x] Session/Callbacks設定（JWT、24時間）
  - [x] CSRF対策強化設定
  - [x] 認証保護Middleware作成
- [x] データベーススキーマ実装
  - [x] Supabase migrationでテーブル作成（8テーブル）
  - [x] Row Level Security (RLS) ポリシー設定
  - [x] インデックス作成
- [x] 環境変数設定
  - [x] NEXT_PUBLIC_SUPABASE_URL
  - [x] NEXT_PUBLIC_SUPABASE_ANON_KEY
  - [x] SUPABASE_SERVICE_ROLE_KEY
  - [x] NEXTAUTH_SECRET
  - [x] NEXTAUTH_URL

### TMDb API連携
- [x] TMDb APIキー取得
- [x] axiosインスタンス作成
- [x] API Client実装（lib/api/tmdb.ts）
- [x] 映画情報取得のテスト

---

## フェーズ2: 認証機能（1-2週間）

- [x] 1. usersテーブルにroleカラム追加 + 管理者Seeder
- [x] 2. 新規登録フロー（フォーム + API + パスワードハッシュ化）
- [x] 3. ログイン・セッション管理
- [x] 4. パスワード変更機能
- [x] 5. セキュリティ対策（レート制限、CSRF、XSS）
- [x] 6. UX改善（ローディング、エラーメッセージ、自動遷移）

### 新規登録フロー（NextAuth.js Credentials Provider）
- [x] 登録フォームUI実装（react-hook-form）
- [x] バリデーションスキーマ実装（zod）
  - メールアドレス形式チェック
  - パスワードポリシー: 8文字以上、英字（大文字・小文字）+ 数字必須
- [ ] NextAuth.js Credentials Provider設定
- [x] カスタム登録API実装（`/api/auth/register`）
- [x] パスワードハッシュ化実装（bcrypt）
- [ ] axiosインスタンスでAPI呼び出し

### 管理者ユーザー
- [x] usersテーブルにroleカラム追加（デフォルト: 'user'、管理者: 'admin'）
- [x] 管理者Seeder作成
  - role = 'admin' で挿入
  - Supabase SQLまたはスクリプトで管理者ユーザーを追加

### ログイン・セッション管理（NextAuth.js）
- [x] ログインフォームUI実装（react-hook-form + zod）
- [x] NextAuth.js signIn()統合
- [x] Session Callbacksカスタマイズ（JWT、24時間有効期限）
- [x] NextAuth.js Middlewareでルート保護
- [x] axiosインターセプターでセッション管理

### パスワード変更機能
- [x] パスワード変更機能実装
  - アカウント設定画面実装
  - パスワード変更フォームUI実装（react-hook-form + zod）
    - 現在のパスワード入力
    - 新しいパスワード入力
    - 新しいパスワード（確認）入力
  - パスワード変更API実装（`/api/user/change-password`）
  - 現在のパスワード確認
  - 新パスワードバリデーション（8文字以上、英字大小 + 数字）

### セキュリティ対策
- [x] レート制限実装（3回までの試行制限）
  - ログイン: 3回失敗で30分ロック
  - パスワード変更: 3回失敗で30分ロック
- [x] CSRF対策（NextAuth.js sameSite: 'lax' + httpOnly + Secure Cookie）
- [x] XSS対策（セキュリティヘッダー: CSP, X-Content-Type-Options, X-Frame-Options, HSTS等）
- [x] パスワードポリシー実装（zod schemaで実装済み）

### UX改善
- [x] ローディング状態実装
  - 全画面ローディングコンポーネント（オーバーレイ + 操作ブロック）
  - API呼び出し中のローディング表示
  - ローディングサークル + メッセージ表示
- [x] エラーメッセージ改善
  - ユーザーフレンドリーで具体的なメッセージ
  - zodバリデーションエラーのカスタマイズ
  - Toast通知でエラー表示（5秒）
- [x] 自動遷移実装
  - ログイン成功後 → ホーム画面へ自動遷移

---

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

---

## フェーズ4: ウォッチリスト機能（1週間）

### ユーザープロフィール表示
- [x] ユーザーアイコン・名前表示（NextAuth.jsセッション情報から取得）
- [x] アイコン押下時のポップオーバーメニュー実装
  - 設定リンク
  - ログアウトボタン
- [x] 設定画面の設計・実装
  - 表示名変更
  - 通知設定
  - テーマ切り替え

### ウォッチリスト機能

#### Step 1: DB確認・API・フック基盤（`feature/watchlist-api`）
- [x] watchlistテーブルの既存migration確認（RLS・インデックス・UNIQUE制約のWHERE deleted_at IS NULL対応）
- [x] ウォッチリスト一覧取得API（GET /api/watchlist）
  - NextAuth.jsで認証チェック
  - カーソルベースページング（無限スクロール用、20件ずつ）
  - ソート: 追加日順（新しい順）
- [x] ウォッチリスト追加API（POST /api/watchlist）
  - NextAuth.jsで認証チェック
  - 重複チェック（409 Conflict）
- [x] ウォッチリスト削除API（DELETE /api/watchlist/:id）
  - NextAuth.jsで認証チェック
  - 論理削除（deleted_at更新）
- [x] zodバリデーションスキーマ作成
- [x] APIクライアント（src/lib/api/watchlist.ts）作成
- [x] useWatchlistフック作成（TanStack Query）
  - useInfiniteQuery（サイドバー一覧用、20件ずつ）
  - useMutation（追加・削除、楽観的UI更新）
  - ウォッチリスト状態チェック（キャッシュから判定）
- [x] テストを追加
  - API Routeテスト（/api/watchlist）
    - GET: 認証チェック・ページング・ソート・deleted_atフィルタ
    - POST: 認証チェック・正常追加・重複409・バリデーションエラー
    - DELETE: 認証チェック・正常削除・404（存在しない/他ユーザー/削除済み）
  - zodスキーマテスト（watchlistAddSchema等）
  - APIクライアントテスト（getWatchlist・addWatchlist・removeWatchlist）
  - useWatchlistフックテスト
    - 一覧取得（useInfiniteQuery）・次ページ読み込み
    - 追加mutation・楽観的更新・エラー時ロールバック
    - 削除mutation・楽観的更新・エラー時ロールバック
    - ウォッチリスト状態チェック（isInWatchlist）

#### Step 2: サイドバーウォッチリスト表示（`feature/watchlist-sidebar`）
- [x] MovieDetailModalを共通UIコンポーネントに移動（features/movies/component/ → components/ui/movie/detailModal/）
  - 現在movieListContentからのみ使用されているが、WatchlistPanel・お気に入り等からも使うため共通化
  - 既存のimportパスを更新
- [x] WatchlistItemコンポーネント作成（小ポスター + タイトル + 削除ボタン、クリックで映画詳細モーダル表示）
- [x] WatchlistPanelコンポーネント作成（サイドバー内、高さ300px、スクロール + 無限読み込み + MovieDetailModal統合）
- [x] 既存Sidebarのwatchlist propにWatchlistPanelを渡して統合（スロット・見出しは実装済み）
- [x] 空状態の表示（「ウォッチリストに映画を追加しましょう」）
- [x] テストを追加
  - WatchlistItemテスト
    - レンダリング（ポスター・タイトル・削除ボタン表示）
    - アイテムクリック時にonClick（映画詳細モーダル表示用）コールバック
    - 削除ボタンクリック時のコールバック（onClickを発火しない、stopPropagation）
    - ポスター画像なし時のフォールバック表示
    - aria属性の確認
  - WatchlistPanelテスト
    - 一覧表示（複数件）
    - 空状態メッセージ表示
    - ローディング状態表示
    - スクロール時の追加読み込みトリガー（Intersection Observer）

#### Step 3: MovieTileウォッチリスト統合（`feature/watchlist-tile`）
- [x] WatchlistAddButtonコンポーネント作成（プラスアイコン / チェックアイコン切替）
- [x] MovieTileにWatchlistAddButton統合（ポスター上にオーバーレイ表示）
  - event.stopPropagation()で詳細モーダルと干渉しない
- [x] 映画詳細モーダル内にもウォッチリスト追加/削除ボタン配置
- [x] 楽観的UI更新（追加/削除時に即座にUI反映、失敗時にロールバック）
- [x] Toast通知（「ウォッチリストに追加しました」「ウォッチリストから削除しました」）
- [x] テストを追加
  - WatchlistAddButtonテスト
    - 未追加時: プラスアイコン表示・クリックで追加コールバック
    - 追加済み時: チェックアイコン表示・クリックで削除コールバック
    - event.stopPropagation()が呼ばれることの確認
    - aria-label切替（「ウォッチリストに追加」/「ウォッチリストから削除」）
  - MovieTile統合テスト
    - WatchlistAddButtonがポスター上に表示される
    - ボタンクリックがMovieTileのonClickを発火しない
  - 映画詳細モーダル統合テスト
    - ウォッチリスト追加/削除ボタンの表示・動作
  - E2Eテスト（Playwright）
    - MovieTileからウォッチリスト追加 → サイドバーに反映
    - サイドバーから削除 → MovieTileのアイコンが戻る
    - 詳細モーダルからウォッチリスト追加/削除
    - Toast通知の表示確認

#### Step 3.5: テスト戦略改善 — テスティングトロフィー導入（`setup/testing-trophy`）
- [x] テスト戦略ドキュメント作成（`.claude/documents/testing-strategy.md`）
  - テスティングトロフィーモデルの採用方針
  - 各テストレイヤーの役割・境界・判断基準
    - 静的解析（TypeScript + ESLint）: 型エラー・コード品質
    - 単体テスト（Jest）: 純粋なロジック・ユーティリティ・定数
    - 結合テスト（Jest + RTL）: コンポーネントの振る舞い・フック・API Route
    - E2E（Playwright）: クリティカルユーザーフローのみ
  - E2E設計思想（対象範囲・安定性ルール・データ依存テストの扱い・クリーンアップ方針）
  - テストの安定性ルール（フレーク対策・待機戦略・`waitForTimeout`禁止）
- [x] `e2e-test.md` 更新
  - テストスペック一覧に新規追加分（watchlistButton.spec.ts等）を反映
  - 共通ヘルパー管理ルールを追記（`e2e/helpers/`に集約）
  - `testing-strategy.md` へのリンク追加
- [x] E2E共通ヘルパーのリファクタリング
  - 重複ヘルパー関数（`movieTileButtons`等）を`e2e/helpers/`に集約
  - 各specファイルからのimportに統一
- [x] `/test` スキル更新
  - 参考ドキュメントに `testing-strategy.md` へのリンク追加
- [x] CLAUDE.md更新
  - 設計ドキュメント一覧に `testing-strategy.md` を追加

#### Step 3.6a: カバー済みE2Eテスト削除（`setup/test-layer-review-cleanup`）
- [x] `e2e/layout/footer.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/layout/header.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/navigation/sideNav.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/home/home.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/layout/userMenu.spec.ts` 削除（結合テストでほぼカバー済み）
- [x] E2E関連ドキュメント更新（`e2e-test.md`）

#### Step 3.6b: 認証フォーム結合テスト移行（`setup/test-layer-auth-form`）
- [x] `signin.spec.ts` からバリデーション・エラー表示・リンク遷移テストを結合テストに移行
- [x] `signup.spec.ts` からバリデーション・リンク遷移テストを結合テストに移行
- [x] 移行済みテストケースをE2Eから削除（認証フロー系のみE2Eに残す）

#### Step 3.6c: 映画ページ結合テスト移行（`setup/test-layer-movies`）
- [x] `movieDetail.spec.ts` からモーダル表示・コンテンツ・開閉操作テストを結合テストに移行
- [x] `nowShowing.spec.ts` / `upcoming.spec.ts` からページUI表示テストを結合テストに移行
- [x] `sortFilter.spec.ts` からソート変更・フィルター適用テストを結合テストに移行
- [x] `watchlistButton.spec.ts` からボタン表示・aria属性・状態切替テストを結合テストに移行
- [x] 移行済みテストケースをE2Eから削除（無限スクロール・同期系のみE2Eに残す）

#### Step 3.6d: 設定ページ結合テスト移行（`setup/test-layer-settings`）
- [x] `settings.spec.ts` からバリデーション・テーマ切替・通知トグルテストを結合テストに移行
- [x] 移行済みテストケースをE2Eから削除（認証保護・テーマ切替のみE2Eに残す）

### お気に入り機能（設計書: `.claude/documents/favorites-design.md`）

> テスティングトロフィーモデル（Step 3.5）を最初から適用。各Stepでテストレイヤーを明示する。

#### Step 4: DB・API・スキーマ基盤（`feature/favorites-api`）
- [x] favoritesテーブル作成（Supabase migration）
  - UUID主キー、論理削除、RLSポリシー設定
  - UNIQUE制約（user_id, tmdb_movie_id WHERE deleted_at IS NULL）
  - update_updated_at_column() トリガー適用
- [x] zodバリデーションスキーマ作成（favoritesAddSchema, favoritesUpdateSchema, favoritesQuerySchema）
- [x] お気に入り定数追加（エラーメッセージ、成功メッセージ、queryKeys等）
- [x] 映画一覧API（GET /api/movies）にお気に入り情報を追加
  - 認証済みの場合、favoritesテーブルをLEFT JOINし各映画に `favorite: { id, rating } | null` を付与
  - 未認証の場合は `favorite` フィールドを含めない
- [x] 映画詳細API（GET /api/movies/:id）にお気に入り情報を追加
  - 認証済みの場合、`favorite: { id, rating } | null` を付与
- [x] お気に入り一覧取得API（GET /api/favorites）
  - NextAuth.jsで認証チェック
  - ページベースページング（page/limit、20件ずつ）
  - ソート: 登録日順（added_at） / 評価順（rating）
- [x] お気に入り追加API（POST /api/favorites）
  - NextAuth.jsで認証チェック
  - 重複チェック（409 Conflict）
- [x] 評価更新API（PATCH /api/favorites/:id）
  - NextAuth.jsで認証チェック
  - 所有者チェック（404 Not Found）
- [x] お気に入り削除API（DELETE /api/favorites/:id）
  - NextAuth.jsで認証チェック
  - 論理削除（deleted_at更新）
- [x] APIクライアント（src/lib/api/favorites/favorites.ts）作成
- [x] 単体テスト
  - zodスキーマテスト（favoritesAddSchema, favoritesUpdateSchema, favoritesQuerySchema）
  - APIクライアントテスト（getFavorites, addFavorite, updateFavoriteRating, removeFavorite）
- [x] 結合テスト
  - API Routeテスト（GET /api/movies）— お気に入り情報付与
    - 認証済み: 各映画に `favorite` フィールドが含まれる
    - 未認証: `favorite` フィールドが含まれない
    - お気に入り登録済み映画: `{ id, rating }` が返る
    - 未登録映画: `null` が返る
  - API Routeテスト（GET /api/movies/:id）— お気に入り情報付与
    - 認証済み/未認証の `favorite` フィールド確認
  - API Routeテスト（/api/favorites）
    - GET: 認証チェック・ページング・ソート・deleted_atフィルタ
    - POST: 認証チェック・正常追加・重複409・バリデーションエラー
  - API Routeテスト（/api/favorites/:id）
    - PATCH: 認証チェック・正常更新・バリデーションエラー・404（存在しない/他ユーザー/削除済み）
    - DELETE: 認証チェック・正常削除・404（存在しない/他ユーザー/削除済み）

#### Step 5: お気に入りUI + MovieTile統合（`feature/favorites-ui`）
- [x] useFavoritesフック作成（TanStack Query）
  - useQuery（一覧取得 — /favoritesページ用）
  - useMutation（追加・評価更新・削除）
  - 楽観的UI更新（映画一覧キャッシュ内の該当映画の `favorite` フィールドを更新）
- [x] useFavoriteToggleフック作成
  - useFavorites + useToast を統合
  - 未登録: RatingModal表示 → 登録
  - 登録済み: RatingModal表示（現在の評価セット）→ 更新 or 削除
- [x] RatingIndicatorコンポーネント作成（1〜10点、数値インジケーター）
  - インタラクティブモード（モーダル内）: クリックで評価選択
  - 表示モード（一覧画面）: 読み取り専用
- [x] FavoriteRatingModalコンポーネント作成（点数入力モーダル）
  - Radix UI Dialogベース
  - 映画タイトル表示 + RatingIndicator
  - 新規: 「登録」「キャンセル」ボタン
  - 更新: 現在の評価を初期値 + 「更新」「削除」「キャンセル」ボタン
- [x] FavoriteButtonコンポーネント作成（ハートアイコン）
  - props: `favorite: { id, rating } | null`（映画一覧レスポンスから渡される）
  - `favorite` が null: 白抜きハート → クリックでRatingModal表示
  - `favorite` がオブジェクト: 塗りつぶしハート（$secondary-600）→ クリックで評価変更モーダル表示
  - event.stopPropagation()でMovieTileクリックと干渉しない
- [x] MovieTileにFavoriteButton統合（ポスター上にオーバーレイ表示）
- [x] 映画詳細モーダル内にもFavoriteButton配置
- [x] Toast通知（「お気に入りに追加しました」「お気に入りから削除しました」「評価を更新しました」）
- [x] 結合テスト
  - useFavoritesフックテスト
    - 一覧取得（useQuery）・ページ切替
    - 追加mutation・映画一覧キャッシュの楽観的更新・エラー時ロールバック
    - 評価更新mutation・映画一覧キャッシュの楽観的更新
    - 削除mutation・映画一覧キャッシュの楽観的更新・エラー時ロールバック
  - useFavoriteToggleフックテスト
    - 未登録映画: モーダル表示フラグON
    - 登録済み映画: モーダル表示フラグON（現在の評価付き）
  - RatingIndicatorテスト
    - インタラクティブモード: クリックで値変更・コールバック発火
    - 表示モード: 読み取り専用で表示・クリック無効
    - aria属性の確認
  - FavoriteRatingModalテスト
    - 新規登録: タイトル表示・評価選択・登録ボタンで送信
    - 評価変更: 現在の評価が初期値・更新ボタンで送信
    - 削除: 削除ボタンで削除コールバック発火
    - キャンセル・ESCで閉じる
  - FavoriteButtonテスト
    - 未登録時: 白抜きハート表示・クリックでコールバック
    - 登録済み時: 塗りつぶしハート表示・クリックでコールバック
    - event.stopPropagation()の確認
    - aria-label切替（「お気に入りに追加」/「お気に入りを編集」）
  - MovieTile統合テスト
    - FavoriteButtonがポスター上に表示される
    - ボタンクリックがMovieTileのonClickを発火しない
  - 映画詳細モーダル統合テスト
    - FavoriteButton表示・動作確認

#### Step 6: お気に入り一覧ページ（`feature/favorites-page`）
- [x] ROUTES定数にFAVORITES追加
- [x] SideNavに「お気に入り」項目追加
- [x] /favorites ページ作成（メタデータ設定）
- [x] FavoriteListコンポーネント作成
  - MovieTileと同様のグリッドレイアウト
  - 各タイルにRatingIndicator（表示モード）を表示
  - 空状態の表示（「お気に入りの映画を追加しましょう」）
- [x] ソートSelect（登録日順 / 評価順）
- [x] useFavoritesPageフック作成（ソート状態管理 + useFavorites統合）
- [x] 結合テスト
  - FavoriteListテスト
    - 一覧表示（複数件・グリッド）
    - 空状態メッセージ表示
    - ローディング状態表示
    - 各タイルにRatingIndicator表示
  - favoritesPageテスト
    - ソート切替（登録日順 ↔ 評価順）
    - FavoriteButtonクリック → RatingModal表示
- [x] E2Eテスト（Playwright）— クリティカルユーザーフローのみ
  - MovieTileからお気に入り追加（評価選択 → 登録）→ ハートアイコン変化
  - お気に入り一覧ページで表示確認 → 評価変更 → 削除
  - 詳細モーダルからお気に入り追加/削除

---

## フェーズ5: カレンダー機能（1週間）

### セットアップ
- [x] FullCalendar（@fullcalendar/react + daygrid + interaction）インストール・設定
  - SCSS Modulesでのカスタムスタイリング設定

### カレンダー用API
- [x] `GET /api/watchlist/calendar` 実装
  - クエリパラメータ: `month`（YYYY-MM形式、デフォルト: 当月）
  - ウォッチリストの映画を指定月の1日〜末日の範囲で `release_date` フィルタ
  - `release_date` がNULLの映画は除外
  - 認証必須（NextAuth.jsセッション）
  - レスポンス: 日付をキーとした映画リストのマップ形式
  - zodバリデーション（monthパラメータ）
  - 統一エラーレスポンス形式
- [x] カレンダー用APIテスト
  - 正常系（月指定あり / デフォルト当月）
  - 映画がない月の空レスポンス
  - release_dateがNULLの映画が除外されること
  - 認証エラー（401）
  - バリデーションエラー（不正なmonth形式）

### カスタムフック
- [x] useCalendar フック実装
  - 表示月の状態管理（前月・次月切り替え）
  - 選択日の状態管理
  - API呼び出し（月変更時にデータ取得）
  - 取得済み月データのキャッシュ（Map で保持、同じ月への再切り替え時はAPI呼び出しスキップ）
  - ダイアログ開閉時のキャッシュクリア（再度開いた時に最新データを取得）
  - 日付ごとの映画マッピング（useMemo）
  - 月切り替えハンドラー（useCallback）
  - 日付選択ハンドラー（useCallback）
  - ローディング・エラー状態管理
- [x] useCalendar フックテスト
  - 初期状態（当月表示）
  - 月切り替え（前月・次月）
  - 日付選択で該当映画リスト取得
  - API呼び出しタイミング（月変更時のみ）
  - キャッシュ済みの月への再切り替え時はAPI呼び出しなし
  - ダイアログ再オープン時にキャッシュクリア → 再取得
  - ローディング状態遷移
  - エラーハンドリング

### コンポーネント実装
- [x] CalendarDialog コンポーネント実装
  - Radix UI Dialog（size: xl）
  - react-day-picker で月間カレンダー表示
  - 映画がある日付にドット/バッジ表示
  - 日付クリックでその日の映画一覧を表示
  - 月切り替え（前月・次月ボタン）
  - ローディング状態表示
  - React.memo + displayName 必須
- [x] CalendarMovieList コンポーネント実装
  - 選択日の映画一覧表示
  - ポスターサムネイル（w92）+ タイトル + 公開日
  - 映画クリックで詳細モーダル表示
  - React.memo + displayName 必須
- [x] サイドバーカレンダーボタン実装
  - Sidebar の calendarButton props に接続
  - カレンダーアイコン + テキスト
  - ダイアログ開閉制御

### スタイリング
- [x] CalendarDialog SCSS Modules
  - react-day-picker のカスタムスタイリング
  - デザインシステム変数使用（ハードコード禁止）
  - 映画ドット/バッジのスタイル
  - 選択日のハイライト
  - CalendarMovieList のレイアウト
  - WCAG AA コントラスト準拠

### テスト
- [x] CalendarDialog コンポーネントテスト
  - ダイアログ開閉（ESCキー・オーバーレイクリック）
  - 月切り替え操作
  - 日付選択で映画一覧表示
  - ローディング状態表示
- [x] CalendarMovieList コンポーネントテスト
  - 映画一覧の正しい表示（ポスター・タイトル・公開日）
  - 映画クリックイベント発火
- [x] E2Eテスト（Playwright）
  - サイドバーボタンクリック → カレンダーダイアログ表示
  - 月切り替え → データ更新確認
  - ESCキーでダイアログ閉じる

---

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

---

## フェーズ7: UI/UX改善（1週間）

### レスポンシブ対応
- [ ] スマホレイアウト最適化
- [ ] タブレットレイアウト最適化
- [ ] サイドバーのモバイル対応（ハンバーガーメニュー）

### スタイリング改善
- [ ] ホバーエフェクト（opacity変化等）
- [ ] フォーカス状態のスタイリング
- [ ] トランジション効果（opacity 0.2s ease等）
- [ ] カラーコントラスト確認

### アクセシビリティ
- [x] ARIA属性: Radix UIで自動対応 - 確定
- [x] キーボード操作: Radix UIで自動対応 - 確定
- [x] フォーカス管理: Radix UIで自動対応 - 確定
- [ ] 追加のアクセシビリティ対応（カスタムコンポーネント用）

---

## フェーズ8: テスト・品質保証（1週間）

### テスト実装
- [ ] 単体テスト（Jest + React Testing Library）
  - [ ] 共通コンポーネントのテスト
  - [ ] カスタムフックのテスト（useAuth, useMovies等）
  - [ ] バリデーションロジックのテスト（zodスキーマ）
- [ ] 統合テスト
  - [ ] API Routeテスト
  - [ ] 認証フローテスト
- [ ] E2Eテスト（Playwright）
  - [ ] ユーザー登録・ログインフロー
  - [ ] 映画一覧・詳細表示
  - [ ] ウォッチリスト操作
- [ ] カバレッジ80%以上達成
- [ ] Storybook実装
  - [ ] Storybookセットアップ
  - [ ] 共通コンポーネントのストーリー作成（全コンポーネント）
  - [ ] 機能コンポーネントのストーリー作成（主要なもの）
  - [ ] インタラクションテスト実装
  - [ ] デザインシステムドキュメント化

### パフォーマンス最適化
- [x] React.memo適用 - 確定（全コンポーネント）
- [x] useCallback適用 - 確定（全コールバック関数）
- [ ] Lighthouse監査（目標スコア90以上）
- [ ] バンドルサイズ最適化
- [ ] 画像最適化確認（Next.js Image）
- [ ] キャッシュ戦略確認（movie_cache差分更新）

### セキュリティ監査
- [ ] 脆弱性スキャン
- [ ] 環境変数の再確認
- [ ] OWASP Top 10対策確認

---

## フェーズ9: デプロイ・本番リリース（数日）

### デプロイ準備
- [ ] Vercelプロジェクト作成
- [ ] 環境変数設定
- [ ] カスタムドメイン設定
- [ ] SSL証明書設定

### 本番環境テスト
- [ ] ステージング環境で動作確認
- [ ] パフォーマンステスト
- [ ] セキュリティテスト

### リリース
- [ ] 本番環境デプロイ
- [ ] 動作確認
- [ ] ロールバック手順確認

---

## フェーズ10: 将来的な機能（優先度低）

### OpenAI レコメンド機能
- [ ] OpenAI API連携
  - axiosでOpenAI APIリクエスト
  - サーバー側でAPIキー秘匿
- [ ] ユーザー嗜好分析ロジック実装
- [ ] レコメンドAPI実装（`/api/recommendations`）
  - NextAuth.jsで認証チェック
  - axiosでクライアント側リクエスト
- [ ] レコメンドUI実装
- [ ] A/Bテスト

### レビュー・評価機能
- [ ] データベーススキーマ実装
  - reviewsテーブル作成（id, user_id, movie_id, rating, comment, created_at）
  - インデックス: movie_id, user_id
- [ ] レビュー一覧取得API実装（`GET /api/movies/:id/reviews`）
  - ページネーション対応（10件/ページ）
  - axiosでクライアント側リクエスト
- [ ] レビュー投稿API実装（`POST /api/movies/:id/reviews`）
  - NextAuth.jsで認証チェック
  - バリデーション（rating: 0.5-5.0, comment: 500文字以内）
  - 重複投稿チェック
- [ ] レビューコンポーネント実装
  - ReviewListコンポーネント
  - ReviewFormコンポーネント
  - 星評価入力UI
- [ ] 映画詳細モーダルにレビューセクション追加

### 認証機能拡張（将来的に検討）
- [ ] ソーシャルログイン（Google/Twitter等）
  - NextAuth.js OAuth Providers設定
  - Google Provider / Twitter Provider追加
  - 既存アカウントとの連携機能
- [ ] パスワードレス認証（マジックリンク等）
  - メールリンク認証実装
  - NextAuth.js Email Provider設定
- [ ] 二要素認証（TOTP）
  - Google Authenticator等との連携

### その他機能
- [ ] シェア機能
- [ ] ダークモード
- [ ] 通知機能（公開日リマインダー）
- [ ] 言語切り替え（日本語/英語）

---

## マイルストーン

### MVP（Minimum Viable Product）
**目標: 4-6週間**
- ユーザー認証（登録・ログイン）
- 映画一覧表示
- ウォッチリスト機能
- カレンダー機能
- 検索機能

### v1.0リリース
**目標: 8-10週間**
- MVP + UI/UX改善
- テスト完了
- 本番環境デプロイ

### v2.0（将来）
**目標: 未定**
- OpenAI レコメンド機能
- その他拡張機能

---

## 開発体制・スケジュール確認

### リソース
- [ ] **開発者**: 何人？フルタイム？パートタイム？
- [ ] **デザイナー**: 必要？デザインモックは用意する？
- [ ] **レビュワー**: コードレビュー体制は？

### スケジュール
- [ ] **週次ミーティング**: 実施する？
- [ ] **スプリント**: 1週間単位？2週間単位？
- [ ] **リリース目標日**: 明確に決まっている？

### タスク管理
- [ ] **ツール**: GitHub Projects / Jira / Trello?
- [ ] **ブランチ戦略**: Git Flow / GitHub Flow?
- [ ] **CI/CD**: GitHub Actions設定は？

---

## リスク管理

### 技術的リスク
- [ ] **TMDb API制限**: レート制限の対策は？
- [ ] **データベーススケール**: 大量ユーザー時の対策は？
- [ ] **メール到達率**: SPF/DKIM設定は完了？

### スケジュールリスク
- [ ] **技術選定の遅延**: いつまでに決定するか？
- [ ] **予期せぬバグ**: バッファ期間は確保しているか？
- [ ] **外部依存**: TMDbやメールサービスの障害時の対応は？

### セキュリティリスク
- [ ] **認証の脆弱性**: セキュリティ監査は実施するか？
- [ ] **個人情報保護**: GDPR/個人情報保護法への対応は？
- [ ] **インシデント対応**: 問題発生時の連絡体制は？
