# システムアーキテクチャ設計

## 技術スタック

### フロントエンド
- **Framework**: Next.js 15.5.11 (App Router)
- **言語**: TypeScript 5.x
- **スタイリング**: SCSS Modules
- **UIライブラリ**: Radix UI（ヘッドレスUI、拡張してカスタマイズ）
- **アイコン**: React Icons
- **状態管理**: Zustand
- **HTTP Client**: axios
- **フォームバリデーション**: react-hook-form + zod
- **アニメーション**: なし（opacity等のCSS transitionのみ）
- **パフォーマンス最適化**: React.memo + useCallback必須適用

### バックエンド
- **Framework**: Next.js API Routes + Supabase Edge Functions
- **認証**: NextAuth.js v5 (App Router対応)
- **ORM**: Supabase SDK
- **メール送信**: Resend（無料枠: 3,000通/月、100通/日、2req/s）

### データベース
- **DB**: Supabase (PostgreSQL)

### 外部API
- **TMDb API**: 映画情報取得
  - **レート制限**: 50リクエスト/秒、20コネクション/IP
  - **注意**: 旧制限（40リクエスト/10秒）は2019年12月に廃止
  - **対策**: バッチ処理時の並列リクエスト数を制限（同時10リクエスト程度）
- **OpenAI API**: AIレコメンド機能（gpt-4o-mini、1日1回バッチ生成）

### インフラ
- **ホスティング**: Vercel
- **環境変数管理**: Vercel Environment Variables
- **データベースホスティング**: Supabase
- **画像最適化**: Next.js Image Optimization（自動WebP変換、遅延ロード、スケルトン）

## アーキテクチャパターン

### ディレクトリ構成
```
src/
├── app/                    # Next.js App Router
│   ├── auth/              # 認証関連ページ
│   │   ├── signin/
│   │   ├── signup/
│   │   └── layout.tsx
│   ├── movies/            # 映画一覧ページ
│   │   ├── now-showing/
│   │   └── upcoming/
│   ├── favorites/         # お気に入りページ
│   ├── search/            # 検索ページ
│   ├── settings/          # 設定ページ
│   ├── watchlist/         # ウォッチリストページ
│   ├── api/               # API Routes
│   │   ├── auth/
│   │   ├── cron/
│   │   ├── awards/
│   │   ├── dismissed-movies/
│   │   ├── favorites/
│   │   ├── filters/
│   │   ├── movies/
│   │   ├── user/
│   │   └── watchlist/
│   ├── layout.tsx
│   └── page.tsx
├── components/            # 共通コンポーネント
│   ├── ui/               # 汎用UIコンポーネント
│   ├── layout/           # レイアウトコンポーネント
│   ├── icons/            # アイコンコンポーネント
│   └── providers/        # Providerコンポーネント
├── features/              # 機能別モジュール（コンポーネント・フック・型）
│   ├── awards/
│   ├── auth/
│   ├── calendar/
│   ├── dismissedMovies/
│   ├── favorites/
│   ├── home/
│   ├── movies/
│   ├── nowShowing/
│   ├── recommendations/
│   ├── search/
│   ├── settings/
│   ├── toast/
│   └── watchlist/
├── lib/                  # 外部サービスクライアント・設定
│   ├── api/             # 内部APIクライアント
│   ├── auth/            # NextAuth.js認証設定
│   ├── axios/           # axiosインスタンス設定
│   ├── eiga/            # 映画.comスクレイピング
│   ├── awards/          # 受賞作品同期サービス
│   ├── openai/          # OpenAI APIクライアント
│   ├── otp/             # OTP生成・検証
│   ├── rateLimit/       # レート制限
│   ├── store/           # Zustandストア
│   ├── supabase/        # Supabaseクライアント
│   ├── sync/            # 映画データ同期処理
│   ├── tmdb/            # TMDb APIクライアント
│   └── types/           # lib内部の型定義
├── constants/           # 定数定義
├── helpers/             # ヘルパー関数
├── hooks/               # カスタムフック（ビジネスロジック分離）
├── schema/              # zodバリデーションスキーマ
├── test/                # テストユーティリティ・セットアップ
├── types/               # TypeScript型定義
├── utils/               # 汎用ユーティリティ
├── proxy.ts              # Next.js Proxy（旧 middleware.ts）
└── styles/              # グローバルスタイル
```

**設計原則:**
- **コンポーネント**: UIレンダリングのみ（React.memo必須）
- **カスタムフック**: データ取得、状態管理、ビジネスロジック
- **命名規則**: lowerCamelCase（変数・関数）、PascalCase（コンポーネント・型）
- **ファイル名**: PascalCase（コンポーネント）、lowerCamelCase（フック）
- **スタイル**: SCSS Modules（`.module.scss`）
- **アニメーション**: なし（opacity等のCSS transitionのみ）

### データフロー
```
User Interaction
    ↓
React Component
    ↓
Custom Hook / Context
    ↓
API Route (Next.js)
    ↓
External API / Database
    ↓
Response
    ↓
State Update
    ↓
UI Re-render
```

## API Route一覧

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/auth/register` | ユーザー新規登録 |
| POST | `/api/auth/otp/send` | OTPコード送信 |
| POST | `/api/auth/otp/verify` | OTPコード検証 |
| GET/PUT | `/api/user/profile` | ユーザープロフィール取得・更新 |
| PUT | `/api/user/change-password` | パスワード変更 |
| GET/PUT | `/api/user/settings` | ユーザー設定取得・更新 |
| GET | `/api/movies` | 映画一覧取得 |
| GET | `/api/movies/[id]` | 映画詳細取得 |
| GET | `/api/movies/genres` | ジャンル一覧取得 |
| GET | `/api/movies/search` | 映画検索 |
| GET/POST | `/api/watchlist` | ウォッチリスト取得・追加 |
| DELETE | `/api/watchlist/[id]` | ウォッチリスト削除 |
| GET | `/api/watchlist/calendar` | カレンダー用ウォッチリスト取得 |
| GET/POST | `/api/favorites` | お気に入り取得・追加 |
| DELETE | `/api/favorites/[id]` | お気に入り削除 |
| GET | `/api/filters` | フィルター選択肢取得 |
| GET/POST/DELETE | `/api/dismissed-movies` | 非表示映画管理 |
| GET | `/api/cron/sync-movies` | 映画データ一括同期（週次） |
| GET | `/api/cron/sync-now-playing` | 上映中映画同期（日次） |
| GET | `/api/cron/sync-now-showing` | 映画.com上映中情報同期（日次） |
| GET | `/api/cron/update-movies` | 映画評価・人気度更新（日次） |
| GET | `/api/awards` | 受賞作品一覧取得 |
| GET | `/api/cron/generate-recommendations` | AIレコメンド生成（日次） |
| GET | `/api/cron/sync-award-movies` | 受賞作品同期（月次） |

## 主要機能のアーキテクチャ

### 認証フロー

**認証方式（4種類）:**
1. **メール+パスワード**: 従来の認証（新規登録時はOTPメール認証必須）
2. **メールOTPログイン**: メールにOTPコード送信 → 検証 → ログイン
3. **Google OAuth**: Googleアカウントでログイン
4. **GitHub OAuth**: GitHubアカウントでログイン

**新規登録フロー:**
1. メールアドレス・パスワードで登録（is_verified = false）
2. OTPコード生成・メール送信（Resend、6桁、10分有効）
3. OTP検証成功 → is_verified = true
4. ログイン画面に遷移

**ソーシャルログインフロー:**
1. Google/GitHubボタンクリック → OAuth認証画面
2. 認証成功 → コールバック処理
3. 同じメールの既存ユーザーがいれば自動リンク（accountsテーブル）
4. セッション発行 → ホーム画面

**パスワード変更フロー:**
1. OTPコード送信リクエスト
2. OTP検証 + 新パスワード入力
3. パスワード更新

**セッション管理:** NextAuth.js v5 (JWT方式、24時間有効)

### 映画情報取得フロー

**一覧画面（DBキャッシュあり）:**
1. クライアントからAPI Routeにリクエスト（`GET /api/movies?page=1`）
2. DBから最新映画の取得日時を確認（`MAX(cached_at)`）
3. その日時以降の新作のみTMDb APIで取得（差分更新）
   - TMDb API: `/discover/movie?primary_release_date.gte=...`
4. 取得した新作をDBに保存（UPSERT）
5. DBから指定ページの映画を取得してクライアントに返却

**詳細画面（キャッシュなし）:**
1. クライアントからAPI Routeにリクエスト（`GET /api/movies/:id`）
2. TMDb APIを直接呼び出し（リアルタイム情報取得）
3. クライアントにデータ返却

**バッチ更新（1日1回）:**
1. Vercel Cron Jobsから実行（毎日午前3時JST）
2. DBの全映画IDを取得
3. 100件ずつバッチでTMDb APIから最新情報取得
4. `vote_average`, `popularity` を更新

### ウォッチリスト管理フロー
1. ユーザーが「見たい」ボタンをクリック
2. API Routeに映画IDを送信
3. DBのユーザーテーブルに映画IDを保存
4. クライアント側の状態を更新

## 確定した技術選定

### データ層
- **データベース**: Supabase (PostgreSQL)
- **ORM**: Supabase SDK
- **状態管理**: Zustand（クライアント状態のみ）
  - グローバルUI状態（モーダル開閉、サイドバー表示等）
  - ユーザー設定（テーマ、言語等）
  - 一時的なクライアント状態
  - **サーバーステート除外**: TMDb APIデータ、ユーザーデータ、ウォッチリストはカスタムフックで管理

### バックエンド
- **HTTP Client**:
  - **外部API（TMDb API）**: axios（インターセプター、タイムアウト設定）
  - **内部API Routes**: fetch（Next.js標準、Server Actions優先）
  - **使い分け理由**: axiosは外部API用の高機能クライアント、内部APIはNext.js標準のfetchで十分
- **認証**: NextAuth.js v5 (App Router対応)
  - セッション有効期限: 24時間
  - セッションストレージ: ブラウザメモリ（JWT方式）
  - Cookie設定: 厳密（HttpOnly: true, Secure: true, SameSite: 'strict'）
- **レート制限**: 3回までの試行制限（DBテーブルで管理）
- **CSRF対策**: 厳し目の基本設定（NextAuth.js + カスタムトークン）

### インフラ・デプロイ
- **ホスティング**: Vercel
- **API Key管理**: 環境変数（.env）で管理
- **コード分割**: しない（バンドルサイズ最適化のみ）
- **エラー監視・ロギング**: Vercel Logs集約
  - console.error()でエラー出力 → Vercel Logsに自動収集
  - Vercel DashboardでRuntime Logs確認
  - 将来的にSentry導入を検討（予算次第）
  - ログレベル: error（本番）、info（開発）

### キャッシュ・パフォーマンス
- **キャッシュ戦略**:
  - 一覧画面: DBキャッシュあり（movie_cacheテーブル、差分更新方式）
  - 詳細画面: キャッシュなし（都度TMDb API取得）
  - 検索機能: キャッシュなし（都度TMDb API取得）
  - 初回取得範囲: 今日から3ヶ月先
  - バッチ更新: 1日1回（午前3時JST）
- **画像最適化**: Next.js Image Optimization
  - 自動WebP変換
  - 遅延ロード（lazy loading）
  - スケルトンUI表示
- **ページネーション**: 20件/ページ
- **言語設定**: 日本語のみ（ja-JP固定）

## 確認が必要な事項

### 技術選定
- [x] **データベース**: Supabase - 確定
- [x] **ORM**: Supabase SDK - 確定
- [x] **状態管理**: Zustand - 確定
- [x] **メール送信**: Resend - 確定

### インフラ
- [x] **ホスティング**: Vercel - 確定
- [x] **画像最適化**: Next.js Image Optimization - 確定

### セキュリティ
- [x] **CSRF対策**: 厳し目の基本設定 - 確定（NextAuth.js + カスタムトークン）

### パフォーマンス
- [x] **画像最適化**: 遅延ロード + スケルトンUI - 確定
- [x] **コード分割**: しない - 確定（バンドルサイズ最適化のみ）

### アクセシビリティ
- [x] **カラーコントラスト**: WCAG AA基準を満たす - 確定
- [x] **キーボード操作**: フォーカス表示実装 - 確定
- [x] **スクリーンリーダー**: ARIAラベル実装 - 確定
- [x] **レスポンシブ対応**: PC・スマホ対応（最小幅375px、モバイルファースト）- 確定

### Supabase設定
- [ ] **Row Level Security (RLS)**: ポリシー設計は？
- [x] **Realtime機能**: 使用しない - 確定
- [x] **Storage**: 使用しない（画像はTMDbのみ）- 確定

## Vercel Cron設定

`vercel.json` で以下のCronジョブを定義。すべてUTC基準（JST = UTC+9）。

| パス | スケジュール（UTC） | 実行タイミング（JST） | 用途 |
|------|---------------------|----------------------|------|
| `/api/cron/sync-movies` | `0 20 * * 0` | 毎週月曜 05:00 | 映画データ一括同期（週次） |
| `/api/cron/sync-now-playing` | `0 18 * * *` | 毎日 03:00 | 上映中映画同期（日次） |
| `/api/cron/update-movies` | `0 18 * * *` | 毎日 03:00 | 映画評価・人気度更新（日次） |
| `/api/cron/sync-now-showing` | `0 18 * * *` | 毎日 03:00 | 映画.com上映中情報同期（日次） |
| `/api/cron/generate-recommendations` | `0 3 * * *` | 毎日 12:00 | AIレコメンド生成（日次） |
| `/api/cron/sync-award-movies` | `0 18 28 * *` | 毎月28日 03:00 | 受賞作品同期（月次） |

## セキュリティヘッダー

`next.config.mjs` の `headers()` で全ルート（`/(.*)`）に以下のHTTPヘッダーを付与（CSP を除く）。

| ヘッダー | 値 | 目的 |
|----------|----|------|
| `X-Content-Type-Options` | `nosniff` | MIMEタイプスニッフィング防止 |
| `X-Frame-Options` | `DENY` | クリックジャッキング防止 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | リファラー情報の漏洩抑制 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ブラウザAPIアクセス制限 |
| `X-DNS-Prefetch-Control` | `on` | DNSプリフェッチ有効化 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS強制（2年間） |

### Content-Security-Policy（unsafe-inline 許容・静的配信）

CSP はページと API で付与方法を分離し、いずれも `next.config.mjs` の `headers()` で静的付与する。

| 対象 | 付与元 | 値 |
|------|--------|----|
| HTMLページ（`/(.*)`） | `next.config.mjs`（静的） | `script-src 'self' 'unsafe-inline'`（開発時のみ `'unsafe-eval'` を追加）＋ `report-to` / `report-uri`。ほか `default-src 'self'` 等 |
| `/api/*` | `next.config.mjs`（静的・後勝ちで上書き） | `default-src 'none'; frame-ancestors 'none'` |

**CSP 値の単一ソース化（`src/lib/security/cspDirectives.mjs`）:**
- CSP ディレクティブ定義はプレーン ESM の `cspDirectives.mjs` に集約する。`next.config.mjs`（Node ESM・TS トランスパイル前）は TypeScript を直接 import できないため、値の二重定義（同期漏れ）を避ける目的で共有モジュール化している。
- `next.config.mjs` は `buildCspHeaderValue` / `buildReportingEndpointsValue` を import してヘッダ値を組み立てる。
- `src/lib/security/csp.ts`（`buildCspHeader`）は同モジュールの薄いラッパで、テスト・将来の再利用向けに公開する。
- `script-src` に `'unsafe-inline'` を許容することで静的プリレンダ（`○ Static`）を維持する。nonce / `'strict-dynamic'` は hydration mismatch を招くため採用しない。
- `style-src` は各種ライブラリのインラインスタイル依存のため `'unsafe-inline'` を維持。
- `/api/*` は最も制限的な CSP を静的付与し、多層防御を維持する。

**CSP 違反レポートの自前収集（`src/app/api/csp-report/route.ts`）:**
- enforce CSP に `report-to csp-endpoint`（＋後方互換の `report-uri /api/csp-report`）を付与し、`Reporting-Endpoints: csp-endpoint="/api/csp-report"` ヘッダで受信先を宣言する。
- `/api/csp-report` は POST で違反レポートを受信し、違反ディレクティブ・blocked-uri 等を構造化ログ（`console.warn('[csp-report]', ...)`）に出力する。report-uri 形式（`application/csp-report`）と Reporting API 形式（`application/reports+json`）の双方に対応。
- 認証不要（ブラウザが未認証で送信するため）。大量送信・悪用対策として本文サイズ上限（16KB）を設け、解析失敗時も含め常に `204` を返す（ブラウザの再送・利用者体験に影響させない）。
