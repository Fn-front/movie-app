# システムアーキテクチャ設計

## 技術スタック

### フロントエンド
- **Framework**: Next.js 15.5.11 (App Router)
- **言語**: TypeScript 5.x
- **スタイリング**: SCSS Modules
- **状態管理**: React Context API / useState/useReducer
- **HTTP Client**: axios

### バックエンド
- **Framework**: Next.js API Routes
- **認証**: NextAuth.js v5 (App Router対応)
- **ORM**: Prisma (検討中)

### データベース
- **DB**: PostgreSQL (検討中) / Supabase (検討中)

### 外部API
- **TMDb API**: 映画情報取得
- **OpenAI API**: 将来的なレコメンド機能用

### インフラ
- **ホスティング**: Vercel
- **環境変数管理**: Vercel Environment Variables

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
├── hooks/               # カスタムフック
└── styles/              # グローバルスタイル
```

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

- **HTTP Client**: axios
- **認証**: NextAuth.js v5 (App Router対応)
  - セッション有効期限: 24時間
  - セッションストレージ: ブラウザメモリ（JWT方式）
- **レート制限**: 3回までの試行制限
- **API Key管理**: 環境変数（.env）で管理
- **キャッシュ戦略**:
  - 一覧画面: DBキャッシュあり（movie_cacheテーブル、差分更新方式）
  - 詳細画面: キャッシュなし（都度TMDb API取得）
  - 検索機能: キャッシュなし（都度TMDb API取得）
  - 初回取得範囲: 今日から3ヶ月先
  - バッチ更新: 1日1回（午前3時JST）
- **ページネーション**: 20件/ページ
- **言語設定**: 日本語のみ（ja-JP固定）

## 確認が必要な事項

### 技術選定
- [ ] **データベース**: PostgreSQL直接 or Supabase?
- [ ] **ORM**: Prisma or Drizzle or Supabase SDK?
- [ ] **状態管理**: Context API or Zustand or Jotai?
- [ ] **メール送信**: Resend or SendGrid or AWS SES?

### インフラ
- [ ] **ホスティング**: Vercel確定？他の選択肢は？
- [ ] **画像最適化**: Next.js Image Optimization or Cloudinary?

### セキュリティ
- [ ] **CSRF対策**: NextAuth.jsで自動対応されるが、追加設定は？

### パフォーマンス
- [ ] **画像最適化**: WebP対応？遅延ロード？
- [ ] **コード分割**: 動的import戦略は？
