# 開発ロードマップ

## フェーズ1: 基盤構築（1-2週間）

### 環境セットアップ
- [x] Next.js 15プロジェクト作成
- [x] TypeScript設定
- [x] ESLint/Prettier設定
- [ ] デザインシステムのSCSS変数作成
- [ ] 共通コンポーネントの基礎実装

### データベース・認証基盤
- [x] **技術選定を確定**
  - [x] 認証: NextAuth.js v5
  - [x] HTTP Client: axios
  - [x] レート制限: 3回
  - [ ] データベース: PostgreSQL vs Supabase（残課題）
- [ ] NextAuth.js v5設定
  - [ ] Credentials Providerセットアップ
  - [ ] データベースアダプター設定
  - [ ] Session/Callbacks設定
- [ ] データベーススキーマ実装
- [ ] マイグレーションツール設定
- [ ] 環境変数設定（NEXTAUTH_SECRET等）

### TMDb API連携
- [ ] TMDb APIキー取得
- [ ] axiosインスタンス作成
- [ ] API Client実装（lib/api/tmdb.ts）
- [ ] 映画情報取得のテスト

---

## フェーズ2: 認証機能（1-2週間）

### 新規登録フロー（NextAuth.js Credentials Provider）
- [ ] 登録フォームUI実装
- [ ] バリデーション実装
- [ ] NextAuth.js Credentials Provider設定
- [ ] カスタム登録API実装（`/api/auth/register`）
- [ ] パスワードハッシュ化実装（bcrypt）
- [ ] メール送信機能実装
  - メールサービス選定（Resend/SendGrid/AWS SES）
  - OTPメールテンプレート作成
- [ ] OTP検証フォームUI実装
- [ ] OTP検証API実装（`/api/auth/verify-otp`）
- [ ] axiosインスタンスでAPI呼び出し

### ログイン・セッション管理（NextAuth.js）
- [ ] ログインフォームUI実装
- [ ] NextAuth.js signIn()統合
- [ ] Session Callbacksカスタマイズ
- [ ] NextAuth.js Middlewareでルート保護
- [ ] axiosインターセプターでセッション管理

### セキュリティ対策
- [ ] レート制限実装（3回までの試行制限）
  - ログイン: 3回失敗で30分ロック
  - OTP検証: 3回失敗で30分ロック
- [ ] CSRF対策（NextAuth.jsで自動対応）
- [ ] XSS対策
- [ ] パスワードポリシー実装

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
- [ ] 公開日順ソート実装
- [ ] ページネーション実装（20件/ページ）
- [ ] ローディング状態実装（axios interceptors活用）
- [ ] エラーハンドリング（axios error handling）

### 映画詳細モーダル
- [ ] Modalコンポーネント実装
- [ ] MovieDetailコンポーネント実装
- [ ] 映画詳細取得API実装（`/api/movies/:id`）
  - キャッシュなし、都度TMDb API呼び出し
  - リアルタイム情報取得（runtime, genres, cast, crew, videos等）
- [ ] 背景画像・ポスター表示
- [ ] ジャンル・評価表示

### 画像最適化
- [ ] Next.js Imageコンポーネント活用
- [ ] 遅延ロード実装
- [ ] プレースホルダー実装

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
- [ ] TMDb検索APIとの連携
- [ ] 検索結果表示UI実装
  - axiosでクライアント側リクエスト
  - エラーハンドリング（axios error handling）
- [ ] 履歴機能（オプション）

---

## フェーズ7: UI/UX改善（1週間）

### レスポンシブ対応
- [ ] スマホレイアウト最適化
- [ ] タブレットレイアウト最適化
- [ ] サイドバーのモバイル対応（ハンバーガーメニュー）

### アニメーション
- [ ] ページ遷移アニメーション
- [ ] モーダル開閉アニメーション
- [ ] ホバーエフェクト
- [ ] ローディングアニメーション

### アクセシビリティ
- [ ] ARIA属性追加
- [ ] キーボード操作対応
- [ ] フォーカス管理
- [ ] カラーコントラスト確認

---

## フェーズ8: テスト・品質保証（1週間）

### テスト実装
- [ ] 単体テスト（Jest + React Testing Library）
- [ ] API Routeテスト
- [ ] E2Eテスト（Playwright）
- [ ] カバレッジ80%以上

### パフォーマンス最適化
- [ ] Lighthouse監査
- [ ] バンドルサイズ最適化
- [ ] 画像最適化確認
- [ ] キャッシュ戦略確認

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

### その他機能
- [ ] ソーシャルログイン（Google/Twitter）
  - NextAuth.js OAuth Providers設定
  - Google Provider / Twitter Provider追加
- [ ] レビュー・評価機能
  - axiosでAPI連携
  - NextAuth.jsで認証チェック
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
