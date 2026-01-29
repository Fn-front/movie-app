# 開発ロードマップ

## フェーズ1: 基盤構築（1-2週間）

### 環境セットアップ
- [x] Next.js 15プロジェクト作成
- [x] TypeScript設定
- [x] ESLint/Prettier設定
- [ ] 必要なパッケージインストール
  - [ ] Radix UI（@radix-ui/react-select, react-dialog, react-toast）
  - [ ] React Icons
  - [ ] react-hook-form + zod
  - [ ] その他依存関係
- [ ] 基本設定・スタイリング方針確立
  - [ ] SCSS Modules設定
  - [ ] デザインシステムのSCSS変数作成
  - [ ] 命名規則ドキュメント整備（lowerCamelCase）
  - [ ] アクセシビリティ設定
    - [ ] カラーコントラストWCAG AA基準確認
    - [ ] フォーカス表示スタイル実装（outline: 2px solid $primary-500）
    - [ ] レスポンシブ設定（最小幅375px、モバイルファースト）
- [ ] 共通コンポーネントの基礎実装（Radix UIベース、React.memo必須）
  - [ ] Button（React.memo + aria-label）
  - [ ] Input（フォーム統合、React.memo + aria-label）
  - [ ] Select（@radix-ui/react-select、React.memo + aria-label）
  - [ ] Card（React.memo）
  - [ ] Modal（@radix-ui/react-dialog、React.memo + aria-label）
  - [ ] Toast（@radix-ui/react-toast、5秒表示、React.memo + aria-label）
  - [ ] Loading（全画面オーバーレイ対応、React.memo + aria-label）
  - [ ] 全インタラクティブ要素にaria-label実装
- [ ] カスタムフック基礎実装
  - [ ] useToast（トースト通知管理）
  - [ ] useAuth（認証状態管理）
  - [ ] useMovies（映画データ取得）
  - [ ] useWatchlist（ウォッチリスト操作）

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
  - [x] メール送信: Resend
  - [x] Supabase Realtime: 使用しない
  - [x] Supabase Storage: 使用しない
  - [x] アニメーション: なし（opacity等のCSS transitionのみ）
  - [x] パフォーマンス: React.memo + useCallback必須適用
  - [x] 命名規則: lowerCamelCase
  - [x] テスト: Jest + React Testing Library + Playwright
- [ ] Supabaseプロジェクト作成
  - [ ] Supabaseアカウント作成
  - [ ] 新規プロジェクト作成
  - [ ] 接続情報取得（URL, ANON_KEY, SERVICE_ROLE_KEY）
- [ ] NextAuth.js v5設定
  - [ ] Credentials Providerセットアップ
  - [ ] Supabaseアダプター検討
  - [ ] Session/Callbacks設定
  - [ ] CSRF対策強化設定
- [ ] データベーススキーマ実装
  - [ ] Supabase SQL Editorでテーブル作成
  - [ ] Row Level Security (RLS) ポリシー設定
  - [ ] インデックス作成
- [ ] 環境変数設定
  - NEXTAUTH_SECRET
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY

### TMDb API連携
- [ ] TMDb APIキー取得
- [ ] axiosインスタンス作成
- [ ] API Client実装（lib/api/tmdb.ts）
- [ ] 映画情報取得のテスト

---

## フェーズ2: 認証機能（1-2週間）

### 新規登録フロー（NextAuth.js Credentials Provider）
- [ ] 登録フォームUI実装（react-hook-form）
- [ ] バリデーションスキーマ実装（zod）
  - メールアドレス形式チェック
  - パスワードポリシー: 8文字以上、英字（大文字・小文字）+ 数字必須
- [ ] NextAuth.js Credentials Provider設定
- [ ] カスタム登録API実装（`/api/auth/register`）
- [ ] パスワードハッシュ化実装（bcrypt）
- [ ] メール送信機能実装
  - Resend API統合
  - OTPメールテンプレート作成（6桁数字、10分有効期限）
- [ ] OTP検証フォームUI実装（react-hook-form + zod）
  - 1つの入力欄方式（maxLength=6、pattern="[0-9]{6}"）
  - zodバリデーション（6桁数字チェック）
  - 再送信ボタン（5分間隔制限）
- [ ] OTP検証API実装（`/api/auth/verify-otp`）
  - 3回失敗で30分ロック
  - 再発行は5分間隔
- [ ] axiosインスタンスでAPI呼び出し

### ログイン・セッション管理（NextAuth.js）
- [ ] ログインフォームUI実装（react-hook-form + zod）
- [ ] NextAuth.js signIn()統合
- [ ] Session Callbacksカスタマイズ（JWT、24時間有効期限）
- [ ] NextAuth.js Middlewareでルート保護
- [ ] axiosインターセプターでセッション管理

### パスワード管理機能
- [ ] パスワードリセット機能実装
  - パスワード忘れた画面UI実装
  - リセットトークン生成API実装（`/api/auth/forgot-password`）
  - リセットメール送信（Resend）
  - 新パスワード設定画面UI実装
  - パスワード更新API実装（`/api/auth/reset-password`）
- [ ] パスワード変更機能実装
  - アカウント設定画面実装
  - パスワード変更フォームUI実装（react-hook-form + zod）
  - パスワード変更API実装（`/api/user/change-password`）
  - 現在のパスワード確認
  - 新パスワードバリデーション（8文字以上、英字大小 + 数字）

### セキュリティ対策
- [ ] レート制限実装（3回までの試行制限）
  - ログイン: 3回失敗で30分ロック
  - OTP検証: 3回失敗で30分ロック
- [ ] CSRF対策（NextAuth.jsで自動対応 + カスタムトークン）
- [ ] XSS対策
- [ ] パスワードポリシー実装（zod schemaで実装済み）

### UX改善
- [ ] ローディング状態実装
  - 全画面ローディングコンポーネント（オーバーレイ + 操作ブロック）
  - API呼び出し中のローディング表示
  - ローディングサークル + メッセージ表示
- [ ] エラーメッセージ改善
  - ユーザーフレンドリーで具体的なメッセージ
  - zodバリデーションエラーのカスタマイズ
  - Toast通知でエラー表示（5秒）
- [ ] 自動遷移実装
  - OTP検証成功後 → ホーム画面へ自動遷移
  - ログイン成功後 → ホーム画面へ自動遷移

---

## フェーズ3: 映画情報表示（1-2週間）

### データベーススキーマ実装
- [ ] movie_cacheテーブル作成
  - id, title, poster_path, backdrop_path, release_date, overview, vote_average, popularity, genre_ids
  - cached_at, updated_at
  - インデックス: release_date, popularity, cached_at, updated_at

### ホーム画面
- [ ] レイアウト実装（Header + Sidebar + Content）
- [ ] MovieTileコンポーネント実装
- [ ] 映画一覧取得API実装（`/api/movies`）
  - DBから最新映画取得日時確認（MAX(cached_at)）
  - その日時以降の新作のみTMDb APIで取得（差分更新）
    - primary_release_date.gte, primary_release_date.lte（今日から3ヶ月先）
    - language=ja-JP, region=JP
  - 取得した新作をDBに保存（UPSERT）
  - DBから指定ページの映画を返却（20件/ページ）
  - sort_byパラメータ対応（release_date, popularity, vote_average）
- [ ] ソート機能実装
  - Selectコンポーネント実装
  - ソート選択肢：公開日順・人気順・評価順
  - クエリパラメータでソート順を管理
- [ ] ページネーション実装（20件/ページ）
- [ ] ローディング状態実装（axios interceptors活用）
- [ ] エラーハンドリング（axios error handling）
  - トースト通知実装（5秒表示）
  - エラータイプ別の色分け

### 映画詳細モーダル
- [ ] Modalコンポーネント実装
- [ ] MovieDetailコンポーネント実装
- [ ] 映画詳細取得API実装（`/api/movies/:id`）
  - キャッシュなし、都度TMDb API呼び出し
  - リアルタイム情報取得（runtime, genres, cast, crew, videos等）
- [ ] 背景画像・ポスター表示
- [ ] ジャンル・評価表示

### 画像最適化
- [ ] 画像URLユーティリティ関数実装（`lib/utils/image.ts`）
  - getTMDbImageUrl関数
  - 画像サイズ型定義（ImageSize）
  - 環境変数からベースURL取得
- [ ] Next.js Imageコンポーネント活用
  - next/imageを全画像表示に使用
  - 各コンポーネントでgetTMDbImageUrl使用
  - width/height指定で最適化
  - プレースホルダー画像設定（blur/placeholder）
- [ ] 遅延ロード実装（Next.js Imageのlazy loading）
- [ ] WebP自動変換（Next.js Image自動対応）

### バッチ更新機能
- [ ] 映画キャッシュ更新API実装（`/api/cron/update-movies`）
  - DBの全映画ID取得
  - 100件ずつバッチでTMDb APIから最新情報取得
  - vote_average, popularity を更新
  - Cron Secret認証実装
- [ ] Vercel Cron Jobs設定
  - 実行スケジュール: 毎日午前3時（JST）
  - CRON_SECRET環境変数設定

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
