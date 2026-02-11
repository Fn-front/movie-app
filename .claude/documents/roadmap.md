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

### Step 11: 映画詳細モーダル（`feature/movie-detail-modal`）
- [ ] 映画詳細API（GET /api/movies/:id）を実装
- [ ] APIクライアントにgetMovieDetailを追加
- [ ] useMovieDetailフックを作成
- [ ] MovieDetailModalコンポーネントを作成
- [ ] MovieDetailContentコンポーネントを作成（バックドロップ・ポスター・ジャンル・評価等）
- [ ] HomePageにモーダル統合（MovieTileクリックで表示）
- [ ] テストを追加

### Step 12: バッチ更新API（`feature/batch-update-movies`）
- [ ] Cron定数を追加
- [ ] バッチ更新API（POST /api/cron/update-movies）を実装
- [ ] Vercel Cron設定（vercel.json）を追加
- [ ] .env.exampleにCRON_SECRETを追加
- [ ] テストを追加

---

## フェーズ4: ウォッチリスト機能（1週間）

### サイドバー
- [ ] ユーザーアイコン・名前表示（NextAuth.jsセッション情報から取得）
- [ ] WatchlistItemコンポーネント実装
- [ ] ウォッチリスト一覧取得API実装（`/api/watchlist`）
  - NextAuth.jsで認証チェック
  - axiosでクライアント側リクエスト
- [ ] リアルタイム更新実装

### 見たいボタン
- [ ] ウォッチリスト追加UI実装
- [ ] ウォッチリスト追加API実装（`POST /api/watchlist`）
  - NextAuth.jsで認証チェック
  - axiosでクライアント側リクエスト
- [ ] ウォッチリスト削除API実装（`DELETE /api/watchlist/:id`）
  - NextAuth.jsで認証チェック
  - axiosでクライアント側リクエスト
- [ ] 楽観的UI更新
- [ ] エラーハンドリング（axios error handling）

---

## フェーズ5: カレンダー機能（1週間）

### カレンダー実装
- [ ] Calendarコンポーネント実装
- [ ] 月間カレンダー表示
- [ ] 公開日マッピング
- [ ] 月切り替え機能
- [ ] カレンダーダイアログ実装
- [ ] サイドバーボタンとの連携

---

## フェーズ6: 検索機能（1週間）

### 検索バー
- [ ] SearchBarコンポーネント実装
- [ ] Headerへの配置
- [ ] デバウンス処理実装

### 検索API
- [ ] 検索API実装（`/api/movies/search`）
  - キャッシュなし、都度TMDb検索API呼び出し
  - axiosでTMDb検索API呼び出し
  - サーバー側でAPIキー秘匿
  - フィルタリングパラメータ対応
    - genre: ジャンルID（複数選択可）
    - year: 公開年
    - vote_average_gte: 最低評価
- [ ] TMDb検索APIとの連携
- [ ] 検索結果表示UI実装
  - axiosでクライアント側リクエスト
  - エラーハンドリング（axios error handling）
- [ ] フィルタリング機能実装
  - MovieFilterコンポーネント実装
  - ジャンルマルチセレクト
  - 年代ドロップダウン（2020-現在+5年先）
  - 評価選択（0-10、0.5刻み）
  - フィルタークリア機能
  - クエリパラメータ管理
- [ ] ジャンルマスターデータ取得
  - TMDb API（`/genre/movie/list`）から取得
  - 日本語ジャンル名取得
- [ ] 履歴機能（オプション）

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
