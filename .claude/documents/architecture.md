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
- **メール送信**: Resend

### データベース
- **DB**: Supabase (PostgreSQL)

### 外部API
- **TMDb API**: 映画情報取得
  - **レート制限**: 50リクエスト/秒、20コネクション/IP
  - **注意**: 旧制限（40リクエスト/10秒）は2019年12月に廃止
  - **対策**: バッチ処理時の並列リクエスト数を制限（同時10リクエスト程度）
- **OpenAI API**: 将来的なレコメンド機能用

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
│   ├── (auth)/            # 認証関連ページグループ
│   │   ├── login/
│   │   └── register/
│   ├── (main)/            # メインアプリケーション
│   │   ├── home/
│   │   ├── calendar/
│   │   └── search/
│   ├── api/               # API Routes
│   │   ├── auth/
│   │   ├── movies/
│   │   └── watchlist/
│   ├── layout.tsx
│   └── page.tsx
├── components/            # 共通コンポーネント
│   ├── common/           # 汎用コンポーネント
│   ├── features/         # 機能別コンポーネント
│   └── layouts/          # レイアウトコンポーネント
├── lib/                  # ユーティリティ・ヘルパー
│   ├── api/             # API関連
│   ├── auth/            # 認証関連
│   └── utils/           # 汎用ユーティリティ
├── types/               # TypeScript型定義
├── hooks/               # カスタムフック（ビジネスロジック分離）
│   ├── useAuth.ts      # 認証状態管理
│   ├── useMovies.ts    # 映画データ取得・キャッシュ
│   ├── useWatchlist.ts # ウォッチリスト操作
│   └── useToast.ts     # トースト通知管理
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

## 主要機能のアーキテクチャ

### 認証フロー
1. メールアドレス・パスワードでログイン
2. 新規登録時はワンタイムパスワード生成
3. OTPメール送信
4. OTP検証で最終認証
5. セッション管理（JWT or Session Cookie）

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
