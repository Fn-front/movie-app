**ステータス: 完了**

## フェーズ9: AIレコメンド機能（設計書: `.claude/documents/recommendations-design.md`）

> テスティングトロフィーモデルを適用。各Stepでテストレイヤーを明示する。

### Step 1: DB・環境変数・定数基盤（`feature/ai-recommendations-db`）
- [x] recommendationsテーブル作成（Supabase migration）
  - UUID主キー、user_id FK、tmdb_movie_id、title、poster_path、release_date、vote_average、genre_ids、reason、display_order（1〜10）
  - UNIQUE制約（user_id, display_order）、（user_id, tmdb_movie_id）
  - RLSポリシー設定（SELECT: 自分のレコメンドのみ、INSERT/UPDATE/DELETE: service_roleのみ）
  - インデックス（user_id）
- [x] 環境変数追加
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`（オプション、デフォルト: gpt-4o-mini）
  - `.env.example` 更新
  - `environment-variables.md` 更新
- [x] レコメンド定数追加（`lib/constants/recommendations.ts`）
  - MAX_COUNT、QUERY_KEY、STALE_TIME
  - メッセージ定数（NO_FAVORITES、NOT_GENERATED、SECTION_TITLE等）
- [x] zodバリデーションスキーマ作成
  - OpenAIレスポンススキーマ（title, year, reason の配列）
  - APIレスポンススキーマ
- [x] 単体テスト
  - zodスキーマテスト（OpenAIレスポンスのパース・バリデーション）

### Step 2: OpenAIレコメンド生成ロジック + Cron API（`feature/ai-recommendations-cron`）
- [x] OpenAIクライアント設定（`lib/openai/client.ts`）
  - openaiパッケージセットアップ
  - モデル設定（環境変数 or デフォルト）
- [x] レコメンド生成ロジック実装（`lib/openai/generateRecommendations.ts`）
  - お気に入りリストからプロンプト組み立て
  - 除外リスト（お気に入り + ウォッチリストのタイトル）をプロンプトに含める
  - OpenAI API呼び出し（response_format: json_object）
  - レスポンスをzodスキーマでパース
- [x] TMDb検索ロジック実装（既存tmdbClientの`searchMovies`を活用）
  - タイトル + 公開年で検索 → tmdb_movie_id, poster_path, release_date, vote_average, genre_ids 取得
  - 検索結果なしの場合はスキップ
  - 除外リスト（tmdb_movie_id）と照合 → 該当があればスキップ
- [x] Cron API実装（`GET /api/cron/generate-recommendations`）
  - CRON_SECRET認証
  - お気に入り1件以上のユーザーを取得
  - ユーザーごとに: お気に入り取得 → 除外リスト取得 → OpenAI → TMDb検索 → DB保存
  - 既存レコメンド DELETE → 新規 INSERT（トランザクション）
  - ユーザー単位のtry-catch（1ユーザーの失敗が他に影響しない）
  - OpenAI/TMDbエラー時は該当ユーザーをスキップし既存レコメンドを維持
- [x] Vercel Cron設定（vercel.json）— 日次実行
- [x] 結合テスト
  - Cron APIテスト
    - CRON_SECRET認証チェック
    - OpenAI APIモック → 正常レスポンスのパース
    - TMDb検索モック → 映画情報取得
    - 除外ロジック（お気に入り/ウォッチリスト重複除外）
    - ユーザー単位エラーハンドリング（失敗ユーザースキップ）
    - お気に入り0件ユーザーのスキップ

### Step 3: レコメンド取得API + フック + APIクライアント（`feature/ai-recommendations-api`）
- [x] APIクライアント作成（`lib/api/recommendations.ts`）
  - getRecommendations()
- [x] レコメンド取得API実装（`GET /api/recommendations`）
  - NextAuth.js認証チェック
  - 自分のrecommendationsをdisplay_order順で取得
  - generated_atを含めて返却
  - レコメンドなし → 空配列 + generated_at: null
- [x] useRecommendationsフック作成（TanStack Query）
  - useQueryでレコメンド取得
  - staleTime: 1時間（日次更新のため）
  - ローディング・エラー状態管理
- [x] 単体テスト
  - APIクライアントテスト（getRecommendations）
- [x] 結合テスト
  - API Routeテスト（GET /api/recommendations）
    - 認証チェック（401）
    - 正常取得（レコメンドあり）
    - レコメンドなし → 空配列
  - useRecommendationsフックテスト

### Step 4: ホームUI統合（`feature/ai-recommendations-ui`）
- [x] RecommendationSectionコンポーネント作成
  - セクション見出し（「あなたへのおすすめ」）
  - 状態分岐:
    - お気に入り0件 → 登録促進テキスト
    - レコメンド未生成 → 「準備中」テキスト
    - レコメンドあり → MovieTile × 10件グリッド表示
  - 各タイルクリックで MovieDetailModal 表示
  - React.memo + displayName 必須
- [x] ホームページにRecommendationSection統合
  - NowShowingMovieListの下に配置
- [x] SCSS Modules スタイリング
  - デザインシステム変数使用
  - レスポンシブ対応（Step 3実装時に調整）
- [x] 結合テスト
  - RecommendationSectionテスト
    - お気に入り0件 → 登録促進テキスト表示
    - レコメンド未生成 → 準備中テキスト表示
    - レコメンドあり → MovieTile 10件表示
    - タイルクリック → MovieDetailModal表示
- [x] E2Eテスト（Playwright）
  - ホームページでレコメンドセクション表示確認
  - レコメンド映画タイルクリック → 詳細モーダル表示

### Step 4.5: 興味なし一覧管理（設定ページ）（`feature/dismissed-movies-settings`）
- [x] 興味なし一覧取得API（GET /api/dismissed-movies）追加
  - NextAuth.js認証チェック
  - deleted_at IS NULLのレコードをcreated_at降順で取得
  - ページングなし（少量想定）
- [x] クライアントAPIに一覧取得関数（getDismissedMovies）を追加
- [x] DismissedMoviesListコンポーネント作成
  - ポスターサムネイル + タイトル + 解除ボタン
  - 解除ボタンクリックでDELETE API → 楽観的UI更新
  - 空状態・ローディング状態
- [x] 設定ページにDismissedMoviesListセクションを追加
- [x] テスト追加
  - GET API Routeテスト（認証チェック・一覧取得・空配列）
  - DismissedMoviesListコンポーネントテスト（一覧表示・解除・空状態）
  - APIクライアントテスト（getDismissedMovies）
- [x] E2Eテスト（Playwright）
  - 設定ページで興味なし一覧表示確認
  - 空状態メッセージ表示
  - 解除ボタンクリック → 楽観的UI更新

### Step 5: AI原題提案機能 → #164

> 詳細は GitHub Issue #164 および設計書 `.claude/documents/title-suggestion-design.md` を参照。

### Step 6: アクティブユーザーフィルター（Cronコスト最適化）（`feature/active-user-filter-cron`）
- [x] usersテーブルに `last_login_at` カラム追加（Supabase migration）
  - TIMESTAMP、NULL許容
- [x] auth.ts signInコールバックで `last_login_at` を更新
  - Credentials / OAuth 共通で認証成功時にDB更新
- [x] auth.ts jwtコールバックで `last_login_at` をスロットリング更新（1時間間隔）
  - `token.lastLoginUpdate` で最終更新時刻を管理
  - 既存の `token.lastPasswordCheck`（5分間隔）と同じパターン
- [x] Cron API（`/api/cron/generate-recommendations`）にアクティブユーザーフィルター追加
  - `last_login_at >= now() - 3日` のユーザーのみレコメンド生成対象
- [x] 結合テスト
  - Cron API: アクティブユーザーフィルタリング

---

## フェーズ9.5: 認証機能拡張（完了済み）

### Step 1: DB・テーブル準備
- [x] accountsテーブル作成（ソーシャルログインアカウント連携用）
  - provider, provider_account_id, access_token 等
  - RLS設定
- [x] otp_codesテーブル作成（OTP検証コード管理用）
  - email, code(6桁), action_type, expires_at, attempts
  - クリーンアップ処理
- [x] usersテーブル変更（password_hash を NULL許容に変更）
- [x] rate_limitsテーブル更新（otp_verify アクション追加）

### Step 2: OTP基盤実装 + OTPVerificationコンポーネント
- [x] OTPコード生成ユーティリティ（crypto.randomInt、6桁数字）
- [x] OTPメール送信処理（Resend統合）
  - Resend SDKセットアップ（`resend` パッケージ）
  - メールテンプレート作成
  - 送信元メールアドレス設定
  - 無料枠制約考慮（3,000通/月、100通/日、2req/s）
- [x] OTP送信API実装（`POST /api/auth/otp/send`）
  - action別バリデーション（registration / login / password_change）
  - 再送間隔チェック（1分）
  - 既存OTP無効化
- [x] OTP検証API実装（`POST /api/auth/otp/verify`）
  - 有効期限チェック（10分）
  - 試行回数チェック（5回）
  - action別後処理
- [x] OTPVerificationコンポーネント作成
  - action prop対応（registration / login / password_change）
  - 送信先メールアドレス表示
  - 再送カウントダウン表示（1分）
  - 残り試行回数表示（エラー時）
  - inputMode="numeric" 対応

### Step 3: 新規登録フロー改修
- [x] 登録API改修（`POST /api/auth/register`）
  - is_verified = false で作成
  - OTP生成・メール送信を追加
- [x] OTP検証画面への遷移処理
- [x] OTP検証成功 → is_verified = true 更新
- [x] ログイン時 is_verified チェック追加

### Step 4: メールOTPログイン実装
- [x] OtpLoginFormコンポーネント作成
  - メールアドレス入力
  - 「ログインコードを送信」ボタン
- [x] OTP送信 → 検証 → セッション発行フロー
- [x] LoginFormに「メールでログイン」リンク追加

### Step 5: ソーシャルログイン実装（Google / GitHub）
- [x] NextAuth.js Provider設定
  - Google Provider追加
  - GitHub Provider追加
- [x] signInコールバック実装（アカウントリンク処理）
  - 同じメールの既存ユーザーとの自動リンク
  - 新規ユーザー作成（is_verified = true）
- [x] SocialLoginButtonsコンポーネント作成
  - Googleログインボタン
  - GitHubログインボタン
- [x] LoginForm / RegisterFormにSocialLoginButtons配置

### Step 6: パスワード変更フロー改修
- [x] パスワード変更API改修（`POST /api/user/change-password`）
  - OTPコード検証を追加
  - 現在のパスワード入力を廃止
- [x] PasswordChangeFormコンポーネント作成
  - OTP送信 → OTP入力 + 新パスワード入力
- [x] 設定画面にPasswordChangeForm配置

### Step 7: テスト
- [x] OTP送信APIテスト
- [x] OTP検証APIテスト
- [x] 登録フロー改修テスト（OTP検証含む）
- [x] メールOTPログインテスト
- [x] ソーシャルログインテスト（モック）
- [x] パスワード変更フロー改修テスト
- [x] OTPVerificationコンポーネントテスト
- [x] SocialLoginButtonsコンポーネントテスト
