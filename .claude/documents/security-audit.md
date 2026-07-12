# OWASPセキュリティ監査結果

実施日: 2026-03-16

## 総合評価: 良好

全23 APIルート、認証フロー、インフラ設定を監査した結果、重大な脆弱性は発見されなかった。
軽微な改善3件を実施し、セキュリティレベルを向上させた。

## 監査結果サマリー

| カテゴリ | 評価 | 備考 |
|---------|------|------|
| 認証・認可 | 安全 | 全APIルートで認証チェック済み、RLS適用済み |
| パスワードハッシュ | 安全 | bcryptjs（salt rounds: 12） |
| JWT・セッション | 安全 | 24時間idle + 7日absolute、パスワード変更時無効化 |
| Cookie | 安全 | HttpOnly / Secure(本番) / SameSite=lax |
| 機密情報露出 | 安全 | NEXT_PUBLIC_にサーバー秘密鍵なし |
| SQLインジェクション | 安全 | パラメータ化クエリ100% |
| XSS | 安全 | dangerouslySetInnerHTML不使用、nonceベースCSP（`unsafe-inline`除去） |
| Zodバリデーション | 安全 | 全APIルートで入力検証済み |
| レート制限 | 安全 | ログイン/パスワード変更/OTP送信/OTP検証/登録で適用 |
| メールアドレス列挙 | 安全 | 登録APIは既存メールでも新規と同一形状の201を返す |
| セキュリティヘッダー | 安全 | nonceベースCSP/HSTS/X-Frame-Options等設定済み |
| SSRF | 安全 | 外部URLはハードコード、ユーザー入力から構築なし |
| サプライチェーン | 安全 | package-lock.json管理、不審スクリプトなし |
| エラー応答 | 安全 | スタックトレース非公開、汎用メッセージ |
| 依存パッケージ | 安全 | npm audit 脆弱性0件 |

## 発見・修正事項

### 修正済み

1. **CSPヘッダー未設定** (中)
   - ファイル: `next.config.mjs`
   - 対応: Content-Security-Policyヘッダーを追加

2. **登録APIのレート制限なし** (高)
   - ファイル: `src/app/api/auth/register/route.ts`
   - 対応: email単位で5回/60分のレート制限を追加

3. **flatted脆弱性（DoS）** (高)
   - 対応: `npm audit fix`でflatted >= 3.4.0に更新

### 追加改善（監査後フォローアップ）

1. **OTP検証エンドポイントのレート制限** (対応済み)
   - ファイル: `src/app/api/auth/otp/verify/route.ts`
   - 対応: email単位で10回/10分の独立したレート制限を追加（OTP行のattemptsとは別の多層防御）。超過時は 429 `RATE_LIMIT_EXCEEDED` + `Retry-After` を返す。上限超過時点からウィンドウ分ロックし、検証成功時にリセット

2. **登録APIのメールアドレス列挙防止** (対応済み)
   - ファイル: `src/app/api/auth/register/route.ts`
   - 対応: 既存メールでも `409 EMAIL_ALREADY_EXISTS` を返さず、新規登録と同一形状の `201`（`userId` はダミーUUID）を返す。既存メール時は DB insert / OTP 生成 / メール送信を行わず、bcrypt.hash + randomDelay(200〜500ms) でタイミングを均一化

3. **CSP の nonce ベース化** (対応済み)
   - ファイル: `src/middleware.ts`, `src/lib/security/csp.ts`, `src/app/layout.tsx`, `next.config.mjs`
   - 対応: リクエスト毎に nonce を生成し `script-src` から `'unsafe-inline'` を除去。`'unsafe-eval'` は本番除去・開発時のみ保持。`/api/*` は `default-src 'none'; frame-ancestors 'none'` を静的付与。副作用として全ページが動的レンダリングになる

### 残存リスク（許容範囲）

1. **NEXT_PUBLIC_TMDB_API_KEY**: TMDb APIキーがクライアント露出。TMDbはpublicなAPIのため許容。
2. **ユーザー操作エンドポイント**: favorites/watchlist等の変更系APIにレート制限なし。認証必須のため悪用リスクは低い。
3. **登録APIの応答時間の完全一致**: 既存メール分岐（SELECT 1回）と新規成功パス（INSERT + Resend 送信）の実処理時間差は randomDelay のジッターで吸収しきれない場合がある。完全な隠蔽はスコープ外。

## 詳細確認項目

### 認証・認可
- [x] 全APIルート認証チェック確認（23ルート）
- [x] RLSポリシー確認（user_idベース制限）
- [x] Middleware保護パス確認（/watchlist, /settings, /favorites）
- [x] CORS: デフォルトsame-origin（明示設定不要）

### 暗号化・トークン
- [x] パスワードハッシュ: bcryptjs cost=12
- [x] JWT: 24h idle / 7d absolute / パスワード変更時無効化
- [x] Cookie: HttpOnly / Secure(prod) / SameSite=lax / __Secure-prefix
- [x] APIキー: サーバーサイドのみ（SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET等）

### 入力検証
- [x] SQLi: Supabase SDKパラメータ化クエリ100%
- [x] XSS: dangerouslySetInnerHTML不使用 + nonceベースCSP（`unsafe-inline`除去）
- [x] メールアドレス列挙: 登録APIは既存メールでも新規と同一形状の201を返す
- [x] Zod: 全APIルートで入力バリデーション実装

### レート制限
- [x] ログイン: 3回/30分
- [x] パスワード変更: 3回/30分
- [x] OTP送信: 1分間隔制限
- [x] OTP検証（OTP行のattempts）: 5回試行制限
- [x] OTP検証エンドポイント: email単位10回/10分（超過後ロック、検証成功でリセット）
- [x] 登録: 5回/60分

### インフラ・設定
- [x] セキュリティヘッダー: nonceベースCSP/HSTS/X-Frame-Options/X-Content-Type-Options
- [x] 環境変数: NEXT_PUBLIC_にサーバー秘密鍵なし
- [x] エラー応答: スタックトレース非公開

### 依存パッケージ
- [x] npm audit: 脆弱性0件
- [x] package-lock.json: 管理済み

### 認証フロー
- [x] パスワードポリシー: 8文字以上、英大小文字+数字
- [x] セッション: 24h idle / 7d absolute
- [x] OTP: 6桁、10分有効期限、5回試行制限
- [x] OAuth: Google/GitHub、コールバック安全

### SSRF
- [x] TMDb API: ベースURL固定、ユーザー入力から構築なし
- [x] 内部ネットワーク: アクセス制限不要（外部APIのみ）

### サプライチェーン
- [x] package-lock.json整合性確認
- [x] 不審なpostinstallスクリプトなし
