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
| XSS | 安全 | dangerouslySetInnerHTML不使用、CSPヘッダー追加済み |
| Zodバリデーション | 安全 | 全APIルートで入力検証済み |
| レート制限 | 安全 | ログイン/パスワード変更/OTP/登録で適用 |
| セキュリティヘッダー | 安全 | CSP/HSTS/X-Frame-Options等設定済み |
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

### 残存リスク（許容範囲）

1. **NEXT_PUBLIC_TMDB_API_KEY**: TMDb APIキーがクライアント露出。TMDbはpublicなAPIのため許容。
2. **ユーザー操作エンドポイント**: favorites/watchlist等の変更系APIにレート制限なし。認証必須のため悪用リスクは低い。

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
- [x] XSS: dangerouslySetInnerHTML不使用 + CSP追加
- [x] Zod: 全APIルートで入力バリデーション実装

### レート制限
- [x] ログイン: 3回/30分
- [x] パスワード変更: 3回/30分
- [x] OTP送信: 1分間隔制限
- [x] OTP検証: 5回試行制限
- [x] 登録: 5回/60分（今回追加）

### インフラ・設定
- [x] セキュリティヘッダー: CSP/HSTS/X-Frame-Options/X-Content-Type-Options
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
