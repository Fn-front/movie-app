# OWASPセキュリティ監査結果

実施日: 2026-11-06（初回監査: 2026-03-16）

## 総合評価: 良好

全51 APIルートファイル、認証フロー、インフラ設定を監査した結果、重大な脆弱性は
発見されなかった。

> **2026-11-06 の棚卸しについて（#935）**
>
> 本文書は長らく更新されておらず、**実装と食い違った記述が複数あった**。とくに
> 「nonce ベース CSP（`unsafe-inline` 除去）」は実装と真逆で、「nonce で守られて
> いる」と誤解させる状態だった。下記はすべて実コードで裏を取り直している。
>
> 検証済みの誤りと訂正内容は「過去の記述の訂正」節に残す。監査文書は事実と
> 違うと、それを前提にした次の判断が狂うため。

## 監査結果サマリー

| カテゴリ | 評価 | 備考 |
|---------|------|------|
| 認証・認可 | 安全 | 認証必須ルートは全て認証チェック済み、RLS適用済み。公開ルート9本は意図的 |
| パスワードハッシュ | 安全 | bcryptjs（salt rounds: 12） |
| JWT・セッション | 安全 | 24時間idle + 7日absolute、パスワード変更時無効化 |
| Cookie | 安全 | HttpOnly / Secure(本番) / SameSite=lax |
| 機密情報露出 | 安全 | NEXT_PUBLIC_にサーバー秘密鍵なし |
| SQLインジェクション | 安全 | パラメータ化クエリ100% |
| XSS | 許容 | `unsafe-inline` を意図的に許容（静的プリレンダ維持）。DOM-based XSS は Trusted Types（#649）で補う方針。`dangerouslySetInnerHTML` は2箇所、いずれも注入元は定数 |
| 入力検証 | 安全 | 入力を受け取る全ルートで検証済み（大半は Zod、一部は手書き） |
| レート制限 | 安全 | 51ルートファイル中41本に適用。認証付き読み取りの欠落は #934 で解消 |
| メールアドレス列挙 | 安全 | 登録APIは既存メールでも新規と同一形状の201を返す |
| セキュリティヘッダー | 安全 | CSP（`unsafe-inline` 許容）/HSTS/X-Frame-Options等設定済み |
| SSRF | 安全 | 外部URLはハードコード、ユーザー入力から構築なし |
| サプライチェーン | 安全 | package-lock.json管理、不審スクリプトなし |
| エラー応答 | 安全 | スタックトレース非公開、汎用メッセージ |
| 依存パッケージ | 安全 | npm audit 脆弱性0件 |

## CSP の方針（重要）

**nonce は使っていない。`unsafe-inline` を明示的に許容している。**

- `src/lib/security/cspDirectives.mjs:120` — `script-src 'self' 'unsafe-inline' ...`
- `src/lib/security/cspDirectives.mjs:123` — `style-src 'self' 'unsafe-inline'`

理由は同ファイル `:10-11` に記載のとおり、**静的プリレンダを維持するため**。
nonce / strict-dynamic はリクエスト毎に値が変わるため、全ページが動的レンダリング
になるうえ hydration mismatch を招く。

`unsafe-inline` の弱点は **Trusted Types** で補う方針（`src/lib/security/trustedTypes.ts:4-7`）。
現在は Report-Only で配信しており、enforce への昇格は #649 で扱う。

> ⚠️ 2026-03-16 時点の本文書には「nonce ベース化（対応済み）」と書かれていたが、
> その後の判断で**方針が逆転している**。nonce 前提の対策を検討しないこと。

## `dangerouslySetInnerHTML` の使用箇所

不使用ではない。`src/app/layout.tsx` の2箇所で使っている。

| 行 | 用途 | 注入元 |
|---|---|---|
| `:54` | テーマ初期化スクリプト | 定数 |
| `:71` | Cookie 同意の consent default ブートストラップ | 定数 |

いずれも**外部入力を通していない**ため実害は無い。`<head>` でインラインに積む
必要がある（gtag.js より前に consent default を送る / 初回描画前にテーマを当てる）
ため、この形を採っている。

## 公開ルート（未認証で到達可能）

意図的に公開しているもの。認証チェックが「漏れている」わけではない。

| ルート | 保護 |
|---|---|
| `auth/[...nextauth]` | NextAuth 標準。Credentials 経路は `src/lib/auth/auth.ts` で制限 |
| `auth/register` / `auth/otp/verify` | レート制限（アカウント×送信元） |
| `auth/password-reset/request` / `confirm` | レート制限（メール単位 / 送信元単位） |
| `awards` | レート制限（送信元単位） |
| `movies/search` / `movies/genres` | `enforcePublicRateLimit`（送信元単位） |
| `csp-report` | インメモリ制限 60回/分 |

## 発見・修正事項

### 修正済み（2026-03-16 監査）

1. **CSPヘッダー未設定** (中)
   - 対応: Content-Security-Policyヘッダーを追加

2. **登録APIのレート制限なし** (高)
   - ファイル: `src/app/api/auth/register/route.ts`
   - 対応: アカウント×送信元で5回/60分のレート制限を追加

3. **flatted脆弱性（DoS）** (高)
   - 対応: `npm audit fix`でflatted >= 3.4.0に更新

### 追加改善（監査後フォローアップ）

1. **OTP検証エンドポイントのレート制限** (対応済み)
   - ファイル: `src/app/api/auth/otp/verify/route.ts`
   - 対応: アカウント×送信元で10回/10分の独立したレート制限（OTP行のattemptsとは別の多層防御）。超過時は 429 `RATE_LIMIT_EXCEEDED` + `Retry-After`

2. **登録APIのメールアドレス列挙防止** (対応済み)
   - ファイル: `src/app/api/auth/register/route.ts`
   - 対応: 既存メールでも新規登録と同一形状の `201` を返す。既存メール時は DB insert / OTP 生成 / メール送信を行わず、bcrypt.hash + randomDelay で時間差を均す

3. **認証付き読み取りのレート制限欠落** (対応済み / #934)
   - 対応: `user/settings` `user/totp` `favorites` `favorites/lookup` `watchlist`
     `dismissed-movies` `admin/accounts` の各 GET に `READ_USER_DATA` を適用

4. **レート制限と検証の実行順序の不統一** (対応済み / #940)
   - 対応: 「レート制限は識別子が確定した直後（検証より前）」に統一。
     方針と例外は `.claude/rules/api-route.md` に明記

### 残存リスク（許容範囲）

1. **NEXT_PUBLIC_TMDB_API_KEY**: TMDb APIキーがクライアント露出。TMDbはpublicなAPIのため許容
2. **CSP の `unsafe-inline`**: 静的プリレンダ維持のため意図的。Trusted Types（#649）で補う
3. **登録APIの応答時間の完全一致**: 既存メール分岐と新規成功パスの実処理時間差は randomDelay で吸収しきれない場合がある。完全な隠蔽はスコープ外
4. **`rate_limits` の保持期間**: 期限切れ行の定期削除が無い（#933）

## 詳細確認項目

### 認証・認可
- [x] 認証必須ルートの認証チェック確認（`withAuth` / `withAdminAuth` / `getAuthSession`）
- [x] 公開ルート9本が意図的なものであることを確認（上記「公開ルート」節）
- [x] admin ロールは JWT ではなく**毎回DBから読む**（`src/helpers/adminAuth.ts`）
- [x] RLSポリシー確認（user_idベース制限）
- [x] 保護パス確認（/watchlist, /settings, /favorites）
- [x] CORS: デフォルトsame-origin（明示設定不要）

### 暗号化・トークン
- [x] パスワードハッシュ: bcryptjs cost=12
- [x] JWT: 24h idle / 7d absolute / パスワード変更時無効化
- [x] Cookie: HttpOnly / Secure(prod) / SameSite=lax / __Secure-prefix
- [x] APIキー: サーバーサイドのみ（SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET等）

### 入力検証
- [x] SQLi: Supabase SDKパラメータ化クエリ100%
- [x] XSS: `unsafe-inline` 許容 + Trusted Types（Report-Only）。`dangerouslySetInnerHTML` は2箇所で注入元は定数
- [x] メールアドレス列挙: 登録APIは既存メールでも新規と同一形状の201を返す
- [x] 入力検証: 入力を受け取る全ルートで実装（Zod が大半。`awards` `movies/[id]` `person/[id]` `admin/awards/existing` は手書き）

### レート制限

実測値（`src/constants/rateLimit.ts` / `src/constants/otp.ts`）。

- [x] ログイン（アカウント×送信元）: 5回/30分
- [x] ログイン（送信元単位）: 20回/15分
- [x] パスワード変更: 3回/30分（`RATE_LIMIT_DEFAULT`）
- [x] 登録: 5回/60分
- [x] OTP再送間隔: 60秒
- [x] OTP日次送信: 5通/24時間（メールアドレス単位）
- [x] OTP検証（OTP行のattempts）: 5回
- [x] OTP検証エンドポイント: 10回/10分（アカウント×送信元）
- [x] 二段階認証（ログイン時）: 5回/15分
- [x] 二段階認証（設定画面）: 5回/15分（**ログインとは別カウンタ** / #940）
- [x] パスワードリセット発行: 5回/60分（メールアドレス単位）
- [x] パスワードリセット確定: 10回/15分（送信元単位）
- [x] 認証付き読み取り（12ルート共有）: 200回/1分
- [x] CSPレポート: 60回/分（インメモリ・送信元単位）

> ⚠️ 「全APIルートでレート制限を適用」とは書かない。**ルート追加で必ず崩れる**。
> 実際 #934 で7本の欠落が見つかった。棚卸しの手順は
> `.claude/rules/api-route.md`「棚卸しのしかた」を参照。
>
> ⚠️ 上の数値は「◯回 / ◯分」というレートではない。`consume_rate_limit` が
> カウンタを戻すのは**その窓のあいだ一度もアクセスが無かったとき**だけで、
> 操作が続く限り加算され続ける。「アイドルを挟むまでの通算回数」と読むこと。
> 超過時のロック時間は窓と同じ長さになる。

### インフラ・設定
- [x] セキュリティヘッダー: CSP（`unsafe-inline` 許容）/HSTS/X-Frame-Options/X-Content-Type-Options
- [x] 環境変数: NEXT_PUBLIC_にサーバー秘密鍵なし
- [x] エラー応答: スタックトレース非公開
- [x] 本番は `/api/cron/*` 以外を404にする（`src/proxy.ts`）

### 依存パッケージ
- [x] npm audit: 脆弱性0件
- [x] package-lock.json: 管理済み

### 認証フロー
- [x] パスワードポリシー: 12文字以上72バイト以内、英大小文字+数字、HIBP 漏洩照合（#652）
- [x] セッション: 24h idle / 7d absolute
- [x] OTP: 6桁、10分有効期限、5回試行制限
- [x] OAuth: Google/GitHub、コールバック安全
- [x] 二段階認証: TOTP + リカバリーコード。設定変更には所持の証明を要求

### SSRF
- [x] TMDb API: ベースURL固定、ユーザー入力から構築なし
- [x] パスワードリセットURL: Host ヘッダではなく設定値から組み立てる
- [x] 内部ネットワーク: アクセス制限不要（外部APIのみ）

### サプライチェーン
- [x] package-lock.json整合性確認
- [x] 不審なpostinstallスクリプトなし

## 過去の記述の訂正（#935）

2026-11-06 時点で実コードと照合し、以下を訂正した。

| 旧記述 | 実態 |
|---|---|
| 「nonceベースCSP（`unsafe-inline`除去）」（3箇所） | **真逆**。`unsafe-inline` を明示許容し nonce 不使用 |
| 「CSP の nonce ベース化（対応済み）」 | 方針が逆転済み。参照先の `src/middleware.ts` も存在しない（`src/proxy.ts` へ移動） |
| 「dangerouslySetInnerHTML不使用」 | `src/app/layout.tsx` の2箇所で使用（注入元は定数） |
| 「全23 APIルート」 | 実際は **51ルートファイル** |
| 「レート制限: ログイン/パスワード変更/OTP送信/OTP検証/登録で適用」 | 実際は41ルートファイルに適用 |
| 「favorites/watchlist等の変更系APIにレート制限なし」（残存リスク） | **誤り**。適用済み。欠けていたのは読み取り系で #934 で解消 |
| 「ログイン: 3回/30分」 | アカウント×送信元 5回/30分 + 送信元 20回/15分 |
| 「全APIルートで認証チェック済み」 | 公開ルートが9本ある（意図的） |
