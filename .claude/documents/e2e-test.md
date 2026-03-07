# E2Eテスト設計

## 概要

Playwright を使用したE2Eテスト基盤。storageStateによる認証セッション再利用で効率的にテストを実行する。

## ディレクトリ構成

```
e2e/
├── .auth/
│   └── storageState.json    # 認証セッション（.gitignore対象）
├── fixtures/
│   └── auth.ts              # 認証fixture（performLogin, globalAuthSetup, test拡張）
├── helpers/
│   └── testUser.ts          # テストユーザー情報（環境変数から取得）
├── auth/
│   ├── signin.spec.ts       # ログインページテスト
│   └── signup.spec.ts       # 新規登録ページテスト
├── movies/
│   ├── upcoming.spec.ts     # 公開予定ページテスト
│   └── nowShowing.spec.ts   # 公開中ページテスト
├── navigation/
│   └── sideNav.spec.ts      # サイドナビゲーションテスト
├── settings/
│   └── settings.spec.ts     # 設定ページテスト
└── global.setup.ts          # グローバルセットアップ（storageState生成）
```

## 認証戦略

### storageState方式

1. `global.setup.ts` がsetupプロジェクトとして最初に実行される
2. テストユーザーで `/auth/signin` にログイン
3. 認証済みCookieを `e2e/.auth/storageState.json` に保存
4. 各ブラウザプロジェクトが `storageState` を読み込み、認証済み状態でテスト開始

### 未認証テスト

認証なしでテストしたい場合は `storageState` を空にオーバーライドする:

```typescript
test.use({ storageState: { cookies: [], origins: [] } });
```

## テストユーザー

環境変数から取得:

| 環境変数 | 用途 |
|---|---|
| `E2E_TEST_USER_EMAIL` | テストユーザーのメールアドレス |
| `E2E_TEST_USER_PASSWORD` | テストユーザーのパスワード |

- ローカル: `.env.local` に設定
- CI: GitHub Secrets（Production environment）に設定
- Supabaseの `users` テーブルに事前登録済みのユーザーであること

## Playwright設定（playwright.config.ts）

### プロジェクト構成

| プロジェクト | 実行環境 | 説明 |
|---|---|---|
| `setup` | CI・ローカル共通 | storageState生成 |
| `chromium` | CI・ローカル共通 | Desktop Chrome |
| `firefox` | ローカルのみ | Desktop Firefox |
| `webkit` | ローカルのみ | Desktop Safari |

### WebServer

| 環境 | コマンド | 説明 |
|---|---|---|
| CI | `npm run build && npm start` | productionモードで実行 |
| ローカル | `npm run dev` | 開発モードで実行 |

### 主な設定値

- `timeout`: 30000ms（テスト全体）
- `expect.timeout`: 10000ms（アサーション）
- `retries`: CI=2回、ローカル=0回
- `screenshot`: 失敗時のみ
- `video`: 失敗時のみ保持
- `trace`: 初回リトライ時

## テストスペック一覧

### e2e/auth/signin.spec.ts（ログイン）

| テスト | 認証 | 説明 |
|---|---|---|
| フォーム表示確認 | 未認証 | 見出し・入力欄・ボタン・リンクの存在確認 |
| 正常ログイン | 未認証 | ログイン後 `/` にリダイレクト |
| メールアドレス未入力 | 未認証 | バリデーションエラー表示 |
| パスワード未入力 | 未認証 | バリデーションエラー表示 |
| メールアドレス形式不正 | 未認証 | バリデーションエラー表示 |
| 不正認証情報 | 未認証 | `role="alert"` でエラーメッセージ確認 |
| 新規登録リンク遷移 | 未認証 | `/auth/signup` に遷移 |
| 認証済みリダイレクト | 認証済み | `/auth/signin` → `/` にリダイレクト |

### e2e/auth/signup.spec.ts（新規登録）

| テスト | 認証 | 説明 |
|---|---|---|
| フォーム表示確認 | 未認証 | 見出し・入力欄・ボタン・リンクの存在確認 |
| メールアドレス未入力 | 未認証 | バリデーションエラー表示 |
| パスワード短すぎ | 未認証 | 8文字未満エラー |
| 大文字なし | 未認証 | 大文字必須エラー |
| パスワード確認不一致 | 未認証 | 不一致エラー |
| ログインリンク遷移 | 未認証 | `/auth/signin` に遷移 |
| 正常登録フロー | 未認証 | **skip**（DB汚染防止） |

### e2e/movies/upcoming.spec.ts（公開予定）

| テスト | 認証 | 説明 |
|---|---|---|
| ページタイトル確認 | 認証済み | `<title>` に「公開予定」を含む |
| ソートセレクト表示 | 認証済み | `combobox` の存在確認 |
| フィルターボタン表示 | 認証済み | フィルターボタンの存在確認 |
| 映画タイル/空メッセージ | 認証済み | データ有無に応じた表示確認 |
| フィルターモーダル開閉 | 認証済み | ダイアログの表示・Escで閉じる |

### e2e/movies/nowShowing.spec.ts（公開中）

公開予定と同様の構成。

### e2e/navigation/sideNav.spec.ts（サイドナビ）

| テスト | 認証 | 説明 |
|---|---|---|
| サイドナビ表示 | 認証済み | `aria-label='映画ナビゲーション'` |
| 「公開予定」リンク存在 | 認証済み | リンクの存在確認 |
| 「公開中」リンク存在 | 認証済み | リンクの存在確認 |
| 公開予定リンク遷移 | 認証済み | `/movies/upcoming` に遷移 |
| 公開中リンク遷移 | 認証済み | `/movies/now-showing` に遷移 |
| aria-current="page" | 認証済み | アクティブリンクのアクセシビリティ確認 |

### e2e/settings/settings.spec.ts（設定）

| テスト | 認証 | 説明 |
|---|---|---|
| フォーム表示確認 | 認証済み | 見出し・入力欄・ボタンの存在確認 |
| 現在パスワード未入力 | 認証済み | バリデーションエラー表示 |
| 新パスワード短すぎ | 認証済み | 8文字未満エラー |
| 確認パスワード不一致 | 認証済み | 不一致エラー |
| 未認証リダイレクト | 未認証 | `/auth/signin` にリダイレクト |

## セレクタ方針

アクセシビリティ優先のセレクタを使用する:

| 優先度 | セレクタ | 例 |
|---|---|---|
| 1 | `getByRole` | `getByRole('button', { name: 'ログイン' })` |
| 2 | `getByLabel` | `getByLabel('メールアドレス')` |
| 3 | `getByText` | `getByText('バリデーションメッセージ')` |
| 4 | `locator` | `locator('[class*="movie_tile"]')` |

### 複数要素にマッチする場合

エラーメッセージがフォーム・Toast・aria-liveの複数箇所に表示される場合は `role` で絞り込む:

```typescript
// NG: 複数要素にマッチする
page.getByText('エラーメッセージ')

// OK: role="alert" のフォーム内エラーに絞り込む
page.getByRole('alert').filter({ hasText: 'エラーメッセージ' })
```

## CI設定（.github/workflows/e2e.yml）

### トリガー

- PRオープン時（main, develop, feature/**, release/**）
- mainブランチへのプッシュ時

### 最適化

- **Chromiumのみ実行**（CI環境）
- **node_modulesキャッシュ**: `package-lock.json` ハッシュベース
- **Playwrightブラウザキャッシュ**: バージョンベースのキャッシュキーで保存、ヒット時はOS依存ライブラリのみインストール

### 必要なGitHub Secrets（Production environment）

| Secret | 用途 |
|---|---|
| `NEXT_PUBLIC_TMDB_API_KEY` | TMDb API |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase接続 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase接続 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase認証（RLSバイパス） |
| `NEXTAUTH_SECRET` | NextAuth secret |
| `E2E_TEST_USER_EMAIL` | テストユーザーメール |
| `E2E_TEST_USER_PASSWORD` | テストユーザーパスワード |

### CI専用の追加環境変数

| 変数 | 値 | 説明 |
|---|---|---|
| `AUTH_SECRET` | `NEXTAUTH_SECRET`と同値 | NextAuth v5のproductionモード対応 |
| `AUTH_TRUST_HOST` | `true` | localhostを信頼するための設定 |
| `NEXTAUTH_URL` | `http://localhost:3000` | 認証コールバックURL |

### アーティファクト

失敗時に以下をアップロード（保持期間30日）:

- `playwright-report/` - HTMLレポート
- `test-results/` - スクリーンショット・動画・トレース

## 実行コマンド

```bash
# ローカル実行（全ブラウザ）
npm run test:e2e

# UIモードでデバッグ
npm run test:e2e:ui

# Chromiumのみ
npx playwright test --project=chromium

# 特定ファイル
npx playwright test e2e/auth/signin.spec.ts

# headed（ブラウザ表示）
npx playwright test --headed
```

## テスト追加時の注意事項

- 認証済みテストは `e2e/fixtures/auth.ts` の `test` / `expect` をインポート
- 未認証テストは `@playwright/test` から直接インポートし `storageState` を空にオーバーライド
- セレクタはアクセシビリティ属性（role, label, aria-*）を優先
- DB状態を変更するテスト（登録等）は `test.skip` で保護するか、テスト後にクリーンアップ
- レート制限に注意: 不正認証テストが連続するとロックされる可能性あり
