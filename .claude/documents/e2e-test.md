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
│   ├── signup.spec.ts       # 新規登録ページテスト
│   ├── logout.spec.ts       # ログアウトテスト
│   └── protection.spec.ts   # 認証保護テスト
├── movies/
│   ├── upcoming.spec.ts     # 公開予定ページテスト
│   ├── nowShowing.spec.ts   # 公開中ページテスト
│   ├── movieDetail.spec.ts  # 映画詳細テスト
│   ├── sortFilter.spec.ts   # ソート・フィルターテスト
│   └── filterPersistence.spec.ts # フィルター永続化テスト
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

## テスト設計思想

E2Eテストの設計方針・各テストレイヤーの役割については `testing-strategy.md` を参照。

## 共通ヘルパー管理ルール

- 2つ以上のspecファイルで使うロケータ・操作は `e2e/helpers/` に集約する
- 各specファイルからimportして使用する
- specファイル内にローカルヘルパーを定義する場合、そのファイル内でしか使わないものに限定する

```
e2e/helpers/
├── testUser.ts          # テストユーザー情報
└── locators.ts          # 共通ロケータ（movieTileButtons等）
```

## テストスペック一覧

### e2e/auth/signin.spec.ts（ログイン認証フロー）

| テスト | 認証 | 説明 |
|---|---|---|
| 正常ログイン | 未認証 | ログイン後 `/` にリダイレクト |
| 認証済みリダイレクト | 認証済み | `/auth/signin` → `/` にリダイレクト |

> フォーム表示・バリデーション・エラー表示・リンク遷移は `loginForm.test.tsx` に移行済み

### e2e/auth/signup.spec.ts（新規登録フロー）

| テスト | 認証 | 説明 |
|---|---|---|
| 正常登録フロー | 未認証 | **skip**（DB汚染防止） |

> フォーム表示・バリデーション・リンク遷移は `registerForm.test.tsx` に移行済み

### e2e/auth/logout.spec.ts（ログアウト）

| テスト | 認証 | 説明 |
|---|---|---|
| signOut APIが正常に応答する | 認証済み | CSRFトークン取得 → signOut APIのPOSTが200を返す |

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

### e2e/movies/movieDetail.spec.ts（映画詳細モーダル）

| テスト | 認証 | 説明 |
|---|---|---|
| 映画タイルクリックで詳細モーダルが開く | 認証済み | `role="dialog"` の表示確認 |
| モーダルに映画タイトルが表示される | 認証済み | aria-labelからタイトル取得・モーダル内に表示 |
| あらすじまたは詳細情報が表示される | 認証済み | いずれかのセクション表示確認 |
| 詳細情報セクションが表示される | 認証済み | 「詳細情報」「人気度」の表示確認 |
| キャストセクションが表示される | 認証済み | データ依存のsoft assertion |
| 配信プロバイダー情報が表示される | 認証済み | データ依存のsoft assertion |
| 閉じるボタンでモーダルが閉じる | 認証済み | 閉じるボタンクリック |
| ESCキーでモーダルが閉じる | 認証済み | Escapeキー |
| オーバーレイクリックでモーダルが閉じる | 認証済み | モーダル外側クリック |
| キーボードで映画タイルを操作してモーダルを開ける | 認証済み | Enterキーで開く |
| 公開中ページでは予算・興行収入が表示される | 認証済み | データ依存のsoft assertion |
| 公開予定ページでは予算・興行収入が表示されない | 認証済み | 非表示確認 |
| モーダルを閉じて別の映画を開ける | 認証済み | 連続開閉の動作確認 |

### e2e/movies/sortFilter.spec.ts（ソート・フィルター操作）

| テスト | 認証 | 説明 |
|---|---|---|
| ソートを変更できる（公開予定） | 認証済み | comboboxで人気順を選択 |
| ジャンルフィルター適用（公開予定） | 認証済み | チェックボックス選択→適用 |
| フィルタークリアボタン（公開予定） | 認証済み | クリア後モーダルが開いたまま |
| リリースタイプタブ切り替え（公開予定） | 認証済み | ストリーミングタブ切り替え |
| ソートを変更できる（公開中） | 認証済み | comboboxで評価順を選択 |
| ジャンルフィルター適用（公開中） | 認証済み | チェックボックス選択→適用 |

### e2e/movies/filterPersistence.spec.ts（フィルター永続化）

| テスト | 認証 | 説明 |
|---|---|---|
| リバイバル除外→リロード→復元確認 | 認証済み | PUT/GETのAPIレスポンス検証・UI復元確認 |

### e2e/movies/watchlistButton.spec.ts（ウォッチリストボタン）

| テスト | 認証 | 説明 |
|---|---|---|
| 映画タイルにウォッチリストボタンが表示される | 認証済み | ボタンの存在確認 |
| aria-labelが適切に設定されている | 認証済み | 「追加」or「削除」ラベル |
| ボタンクリックでモーダルが開かない | 認証済み | stopPropagation確認 |
| ボタンクリックでラベルが切り替わる | 認証済み | 追加↔削除のトグル・クリーンアップ |
| 公開予定ページでも表示される | 認証済み | ページ横断の表示確認 |
| 詳細モーダル内にボタンが表示される | 認証済み | モーダル内のボタン確認 |
| モーダル内でラベルが切り替わる | 認証済み | モーダル内トグル・クリーンアップ |
| モーダルで追加後タイル側も同期される | 認証済み | モーダル↔タイル間の状態同期 |

### e2e/settings/settings.spec.ts（設定）

#### 設定ページ（認証済み）

| テスト | 認証 | 説明 |
|---|---|---|
| 設定画面のセクション表示 | 認証済み | 見出し（設定・プロフィール・通知・外観）の存在確認 |
| パスワード変更フォーム表示 | 認証済み | `/settings/change-password` のフォーム要素確認 |
| 現在パスワード未入力 | 認証済み | バリデーションエラー表示 |
| 新パスワード短すぎ | 認証済み | 8文字未満エラー |
| 確認パスワード不一致 | 認証済み | 不一致エラー |

#### 設定ページ — フォーム要素

| テスト | 認証 | 説明 |
|---|---|---|
| 表示名フォームが表示される | 認証済み | ラベル「表示名」とボタン「表示名を更新」の存在確認 |
| 表示名が空でバリデーションエラー | 認証済み | 「表示名を入力してください」エラー表示 |
| 通知設定のチェックボックス表示 | 認証済み | 「公開日リマインダーを受け取る」チェックボックス確認 |
| 表示名の初期値にユーザー名が入っている | 認証済み | 入力欄が空でないことを確認 |
| 通知チェックボックスをトグルできる | 認証済み | クリックで checked 状態が反転する |
| 通知設定の説明テキスト表示 | 認証済み | 説明文の存在確認 |
| テーマ選択が表示される | 認証済み | 「テーマを選択」テキストの存在確認 |
| テーマ切り替えでdata-theme属性が変わる | 認証済み | 「ダーク」選択で `html[data-theme="dark"]` に変更 |
| テーマの説明テキスト表示 | 認証済み | 説明文の存在確認 |

#### 設定ページ（未認証）

| テスト | 認証 | 説明 |
|---|---|---|
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

- 認証済みテストは `@playwright/test` から `test` / `expect` をインポート（storageStateはPlaywright configで適用済み）
- 未認証テストは `storageState` を空にオーバーライド
- `e2e/fixtures/auth.ts` の `test` は `authenticatedPage` fixture用。通常の認証済みテストでは `@playwright/test` を使用
- セレクタはアクセシビリティ属性（role, label, aria-*）を優先
- DB状態を変更するテスト（登録等）は `test.skip` で保護するか、テスト後にクリーンアップ
- レート制限に注意: 不正認証テストが連続するとロックされる可能性あり
- 共通ロケータは `e2e/helpers/` からimportし、specファイル内での重複定義を避ける
