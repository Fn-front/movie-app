# Flutter iOS アプリ - 開発ロードマップ

## フェーズ0: モノレポ化・環境構築

### モノレポ化
- [ ] 既存のNext.jsコードを `web/` に移動
- [ ] Vercel の Root Directory を `web/` に変更
- [ ] Vercel の Ignored Build Step を設定
- [ ] 共通ドキュメント（`.claude/documents/`）の配置確認
- [ ] 動作確認（Web版が正常にデプロイされること）

### Flutter 環境構築
- [ ] Flutter SDK インストール
- [ ] CocoaPods インストール
- [ ] flutter doctor で全項目チェック通過
- [ ] `mobile/` ディレクトリに Flutter プロジェクト作成
- [ ] ディレクトリ構成の初期作成
- [ ] 主要パッケージのインストール（pubspec.yaml）
- [ ] Lint 設定（analysis_options.yaml）
- [ ] 環境変数設定（.env + flutter_dotenv）
- [ ] iOS シミュレーターでの動作確認

---

## フェーズ1: 基盤構築

### テーマ・デザインシステム
- [ ] ThemeData 設定（Web版デザインシステム準拠）
  - [ ] カラーパレット（primary, secondary, gray, semantic）
  - [ ] タイポグラフィ（Noto Sans JP）
  - [ ] スペーシング定数
  - [ ] ボーダー・角丸定数
  - [ ] シャドウ定数
- [ ] ダークテーマ対応（将来的に）

### データモデル
- [ ] Movie モデル（freezed）
- [ ] User モデル（freezed）
- [ ] WatchlistItem モデル（freezed）
- [ ] ApiResponse モデル（freezed）
- [ ] Genre モデル（freezed）

### サービス層
- [ ] Supabase 初期化（supabase_flutter）
- [ ] dio クライアント設定（TMDb API用）
  - [ ] ベースURL設定
  - [ ] APIキーインターセプター
  - [ ] タイムアウト設定
  - [ ] エラーハンドリング
- [ ] TMDb Service（API呼び出し）
  - [ ] discoverMovies（映画一覧）
  - [ ] getMovieDetail（映画詳細）
  - [ ] searchMovies（映画検索）
  - [ ] getGenres（ジャンル一覧）
  - [ ] getNowPlaying（公開中映画）
  - [ ] getUpcoming（近日公開映画）

### ユーティリティ
- [ ] 画像URL生成（getTMDbImageUrl）
- [ ] 日付フォーマット（formatDate, formatDateTime）
- [ ] 文字列操作（truncate）
- [ ] バリデーション（isValidEmail, isValidPassword）

### 共通ウィジェット
- [ ] AppButton（variant: primary/secondary/outline/ghost）
- [ ] AppInput（テキスト入力、エラー表示対応）
- [ ] AppCard（ホバー効果なし、タップ対応）
- [ ] AppModal（BottomSheet or Dialog）
- [ ] AppToast（SnackBar ベース）
- [ ] AppLoading（全画面オーバーレイ対応）
- [ ] AppAvatar（画像 or イニシャル表示）
- [ ] AppSelect（ドロップダウン）
- [ ] EmptyState（空状態表示）
- [ ] Skeleton / Shimmer（ローディング表示）

### ルーティング
- [ ] go_router 設定
- [ ] 認証状態によるリダイレクト
- [ ] 画面遷移定義

### フェーズ1 テスト
- [ ] モデルのシリアライズ/デシリアライズテスト
- [ ] TMDb Service のテスト
- [ ] ユーティリティのテスト
- [ ] 共通ウィジェットのWidgetテスト

---

## フェーズ2: 認証機能

### 認証基盤
- [ ] Supabase Auth 初期化
- [ ] AuthRepository 実装
- [ ] authProvider（Riverpod）実装
- [ ] 認証状態の監視・自動リフレッシュ

### ログイン画面
- [ ] LoginScreen UI
- [ ] メール + パスワード ログイン
- [ ] ログインフォームバリデーション

### 新規登録画面
- [ ] RegisterScreen UI
- [ ] メール + パスワード + ユーザー名 登録
- [ ] 登録フォームバリデーション

### OTP検証
- [ ] OtpVerificationScreen UI
- [ ] 6桁コード入力
- [ ] OTP検証API呼び出し
- [ ] 再送信機能（1分間隔制限）

### ソーシャルログイン
- [ ] Google OAuth（google_sign_in + supabase_flutter）
- [ ] GitHub OAuth（supabase_flutter）

### パスワード変更
- [ ] ChangePasswordScreen UI
- [ ] OTP送信 → 検証 → パスワード更新

### セッション管理
- [ ] 自動ログイン（セッション復元）
- [ ] ログアウト機能
- [ ] セッション期限切れハンドリング

### フェーズ2 テスト
- [ ] AuthRepository テスト
- [ ] authProvider テスト
- [ ] ログイン画面 Widget テスト
- [ ] 登録画面 Widget テスト

---

## フェーズ3: メイン機能

### レイアウト
- [ ] AppScaffold（共通レイアウト）
- [ ] BottomNavigationBar（ホーム / 検索 / ウォッチリスト / お気に入り / 設定）
- [ ] AppDrawer（サイドメニュー）

### 映画一覧画面
- [ ] HomeScreen UI
- [ ] MovieRepository 実装
- [ ] movieListProvider 実装
- [ ] MovieTile ウィジェット
- [ ] MovieTileSkeleton ウィジェット
- [ ] ページネーション（無限スクロール or ページ切替）
- [ ] 公開中 / 近日公開 タブ切替

### 映画詳細モーダル
- [ ] MovieDetailModal UI
  - [ ] 背景画像
  - [ ] ポスター画像
  - [ ] タイトル（日本語・原題）
  - [ ] 概要
  - [ ] 公開日・上映時間
  - [ ] ジャンル
  - [ ] 評価
  - [ ] 「見たい」ボタン

### 映画検索
- [ ] SearchScreen UI
- [ ] 検索バー
- [ ] 検索結果表示（MovieTile再利用）
- [ ] フィルター機能（ジャンル / 年代 / 評価）
- [ ] FilterModal ウィジェット

### ウォッチリスト
- [ ] WatchlistScreen UI
- [ ] WatchlistRepository 実装
- [ ] watchlistProvider 実装
- [ ] ウォッチリスト追加/削除
- [ ] ウォッチリスト一覧表示

### お気に入り
- [ ] FavoritesScreen UI
- [ ] FavoritesRepository 実装
- [ ] favoritesProvider 実装
- [ ] お気に入り追加/削除
- [ ] お気に入り一覧表示

### フェーズ3 テスト
- [ ] MovieRepository テスト
- [ ] WatchlistRepository テスト
- [ ] movieListProvider テスト
- [ ] watchlistProvider テスト
- [ ] MovieTile Widget テスト
- [ ] MovieDetailModal Widget テスト
- [ ] 各画面の Widget テスト

---

## フェーズ4: 設定・仕上げ

### 設定画面
- [ ] SettingsScreen UI
- [ ] 表示名変更（DisplayName）
- [ ] テーマ切替（light/dark）
- [ ] 通知設定

### UI改善
- [ ] アニメーション（画面遷移、リスト表示）
- [ ] エラー画面
- [ ] 空状態画面
- [ ] Pull-to-Refresh
- [ ] アクセシビリティ対応

### パフォーマンス最適化
- [ ] 画像キャッシュ最適化
- [ ] リスト表示の最適化（ListView.builder）
- [ ] 不要な再ビルド防止

### iOS配布設定
- [ ] Sideloadly セットアップ
- [ ] Wi-Fi ペアリング設定
- [ ] 自動リフレッシュ設定
- [ ] 動作確認（実機）

### フェーズ4 テスト
- [ ] 設定画面テスト
- [ ] 全画面の結合テスト
- [ ] 実機での動作確認
