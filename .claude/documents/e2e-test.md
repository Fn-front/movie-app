# E2Eテスト設計

## 概要

Playwright を使用したE2Eテスト基盤。storageStateによる認証セッション再利用で効率的にテストを実行する。

## ディレクトリ構成

```
e2e/
├── .auth/
│   └── storageState-<runId>.json  # 認証セッション（.gitignore対象）
├── fixtures/
│   └── auth.ts              # 認証fixture（performLogin, globalAuthSetup, test拡張）
├── helpers/
│   ├── runScope.ts          # run単位の識別子（メール・送信元IP・映画ID）
│   └── testUser.ts          # 共有テストユーザー（run単位で生成）
├── auth/
│   ├── signin.spec.ts       # ログインページテスト
│   ├── signup.spec.ts       # 新規登録ページテスト
│   ├── logout.spec.ts       # ログアウトテスト
│   └── protection.spec.ts   # 認証保護テスト
├── movies/
│   ├── upcoming.spec.ts     # 公開予定ページテスト（無限スクロールのみ）
│   ├── nowShowing.spec.ts   # 公開中ページテスト（無限スクロールのみ）
│   ├── sortFilter.spec.ts   # ソート・フィルターテスト
│   ├── filterPersistence.spec.ts # フィルター永続化テスト
│   └── watchlistButton.spec.ts  # ウォッチリスト状態同期テスト
├── watchlist/
│   └── watchlist.spec.ts    # ウォッチリストページテスト
├── settings/
│   └── settings.spec.ts     # 設定ページテスト
├── global.setup.ts          # グローバルセットアップ（テストユーザー作成・storageState生成）
└── global.teardown.ts       # グローバルティアダウン（run固有データの削除）
```

## 認証戦略

### storageState方式

1. `global.setup.ts` がsetupプロジェクトとして最初に実行される
2. この run 専用の共有テストユーザーを作成し、`/auth/signin` にログイン
3. 認証済みCookieを `e2e/.auth/storageState-<runId>.json` に保存
4. 各ブラウザプロジェクトが `storageState` を読み込み、認証済み状態でテスト開始
5. 全プロジェクト終了後、`global.teardown.ts` が run 固有データを削除する

### 未認証テスト

認証なしでテストしたい場合は `storageState` を空にオーバーライドする:

```typescript
test.use({ storageState: { cookies: [], origins: [] } });
```

## テストデータの run 分離（#793）

E2E は共有の Supabase DB に対して実行する。以前は固定のメールアドレス・
固定の映画ID・固定の送信元IPを使っていたため、複数の run が同時に流れると
互いのデータを消し合った。これを避けるためワークフロー側で
`concurrency: e2e-shared-db` による直列化をしていたが、GitHub Actions は
同一 concurrency group の pending を1つしか保持せず、**2つ目がキューに入ると
古い pending を自動キャンセルする**。その結果、E2E が一度も実行されないまま
PR をマージできていた。

そこで識別子を run 単位に分離し、直列化をやめた。採番は
`e2e/helpers/runScope.ts` が担当する。

| 対象 | 分離の方法 |
|---|---|
| メールアドレス | `runScopedEmail('e2e-two-factor')` → `e2e-two-factor-<runId>@example.com` |
| 共有テストユーザー | run ごとに作成・削除（`global.setup.ts` / `global.teardown.ts`） |
| `movie_cache` のシードID | `runScopedMovieId(offset)` で run ごとのID領域を使う |
| 送信元IP（IP単位のレート制限） | `x-forwarded-for: RUN_CLIENT_IP` を Playwright から送る |
| storageState | `e2e/.auth/storageState-<runId>.json` |

### run ID の決まり方

| 環境 | 値 |
|---|---|
| `E2E_RUN_ID` 指定時 | その値（英数字以外は除去） |
| CI | `<GITHUB_RUN_ID>x<GITHUB_RUN_ATTEMPT>` |
| ローカル | `local` |

> ⚠️ 値は **プロセスをまたいで同じ** である必要がある（setup / worker / teardown が
> 別プロセスのため）。乱数ではなく環境変数から決定論的に導出すること。
>
> ⚠️ `E2E_RUN_ID` は **プロセスの環境変数として渡す**こと。`runScope.ts` は
> `playwright.config.ts` の import として `dotenv.config()` より先に評価されるため、
> `.env.local` に書いても効かない。

ローカルで2つ同時に流して衝突しないことを確かめる例:

```bash
E2E_RUN_ID=cc1 npx playwright test --project=chromium --output=test-results/cc1 &
E2E_RUN_ID=cc2 npx playwright test --project=chromium --output=test-results/cc2 &
wait
```

### なぜ送信元IPを詐称するのか

Next.js は `x-forwarded-for` が無いとソケットの remoteAddress を補う
（`node_modules/next/dist/server/base-server.js`）。E2E は常に localhost 接続のため
全 run が同じ `::1` になり、共有DB上で IP 単位のレート制限カウンタ
（`awards_fetch` / `login_ip` / 公開映画API等）を食い合う。run 固有の
プライベートIPを送ることで分離する。

## spec 間のデータ分離（#806）

上記は **run 間**の分離。同じ run の中でも、`fullyParallel: true` によって
spec ファイルは別ワーカーで並列に走る。`describe.configure({ mode: 'serial' })` は
**ファイル内**の直列化しかせず、ファイル間の並列は防げない。

そのため「そのユーザーの全件を消す」後片付け（`cleanupWatchlistForUser()` 等）を
共有テストユーザーに対して複数の spec が呼ぶと、互いのレコードを消し合う。
user_id を識別子とするレート制限カウンタ（`write_api_watchlist` 等）も同様に
枠を食い合う。

### 専用ユーザーを使う spec

自分のデータを占有する必要がある spec は、共有の `TEST_USER` ではなく
`openDedicatedSession()`（`e2e/fixtures/dedicatedSession.ts`）で専用ユーザーを作る。

```typescript
test.describe.configure({ mode: 'serial', timeout: 90000 });

const USER = {
  email: runScopedEmail('e2e-<用途>'),
  password: '<用途>E2e1',
} as const;

test.describe('...', () => {
  // ログインを1回で済ませるため spec 全体で1つのページを使い回す
  let session: DedicatedSession;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // describe の timeout はテストにしか効かない
    testInfo.setTimeout(90000);
    session = await openDedicatedSession(browser, USER);
    page = session.page;
  });

  test.afterAll(async () => {
    await session.close();
  });
});
```

| spec | 専用ユーザーにした理由 |
|---|---|
| `auth/twoFactor.spec.ts` | 二段階認証の有効・無効でユーザーの状態を書き換える（#750） |
| `auth/authFixture.spec.ts` | 同上 |
| `recommendations/recommendationEvents.spec.ts` | お気に入り・おすすめを作り替える |
| `rateLimit/recommendationRefreshCooldown.spec.ts` | 仕込んだクールダウンを他 spec に消されない |
| `watchlist/watchlist.spec.ts` | ウォッチリストを全件削除しながら進める（#806） |
| `movies/watchlistButton.spec.ts` | 同上 |
| `rateLimit/writeApiRateLimit.spec.ts` | `write_api_watchlist` の枠を占有する（#806） |

> ⚠️ ページを使い回すため、`page.route()` を使うモック（`mockMovieDetail()` 等）は
> `beforeEach` ではなく `beforeAll` で1度だけ登録する。`beforeEach` で呼ぶと
> ハンドラが積み上がる。

## Playwright設定（playwright.config.ts）

### プロジェクト構成

| プロジェクト | 実行環境 | 説明 |
|---|---|---|
| `setup` | CI・ローカル共通 | テストユーザー作成・storageState生成 |
| `cleanup` | CI・ローカル共通 | run固有データの削除（setupのteardown） |
| `chromium` | CI・ローカル共通 | Desktop Chrome |
| `firefox` | ローカルのみ | Desktop Firefox |
| `webkit` | ローカルのみ | Desktop Safari |

### テストファイルの判別

`testMatch: '**/*.spec.ts'` を指定し、Playwright が拾うのは `*.spec.ts` だけにしている。
E2Eヘルパーの純粋なロジック（識別子の採番等）は `*.test.ts` として Jest が担当する。

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
| 不正認証情報 | 未認証 | サーバー経由のエラーレスポンス → `role="alert"` でエラーメッセージ確認 |
| 認証済みリダイレクト | 認証済み | `/auth/signin` → `/` にリダイレクト |

> フォーム表示・バリデーション・リンク遷移は `loginForm.test.tsx` に移行済み

### e2e/auth/signup.spec.ts（新規登録フロー）

| テスト | 認証 | 説明 |
|---|---|---|
| 正常登録フロー | 未認証 | **skip**（DB汚染防止） |

> フォーム表示・バリデーション・リンク遷移は `registerForm.test.tsx` に移行済み

### e2e/auth/logout.spec.ts（ログアウト）

| テスト | 認証 | 説明 |
|---|---|---|
| signOut APIが正常に応答する | 認証済み | CSRFトークン取得 → signOut APIのPOSTが200を返す |

### e2e/movies/nowShowing.spec.ts（公開中 — 無限スクロール）

| テスト | 認証 | 説明 |
|---|---|---|
| スクロールで追加データが読み込まれる | 認証済み | Intersection Observer + APIフェッチ + DOM追加の検証 |

> ページタイトル・ソートセレクト・フィルターボタン表示・フィルターモーダル開閉は `movieListContent.test.tsx`, `filterModal.test.tsx` でカバー済み

### e2e/movies/upcoming.spec.ts（公開予定 — 無限スクロール）

| テスト | 認証 | 説明 |
|---|---|---|
| スクロールで追加データが読み込まれる | 認証済み | Intersection Observer + APIフェッチ + DOM追加の検証 |

> ページタイトル・ソートセレクト・フィルターボタン表示・フィルターモーダル開閉は `movieListContent.test.tsx`, `filterModal.test.tsx` でカバー済み

### e2e/movies/sortFilter.spec.ts（ソート・フィルター操作）

| テスト | 認証 | 説明 |
|---|---|---|
| ソートを変更できる（公開予定） | 認証済み | comboboxで人気順を選択 → API再フェッチ |
| ジャンルフィルター適用（公開予定） | 認証済み | チェックボックス選択 → 適用 → API再フェッチ |
| リリースタイプタブ切り替え（公開予定） | 認証済み | ストリーミングタブ切り替え → データ再フェッチ |
| ソートを変更できる（公開中） | 認証済み | comboboxで評価順を選択 → API再フェッチ |
| ジャンルフィルター適用（公開中） | 認証済み | チェックボックス選択 → 適用 → API再フェッチ |

> フィルタークリアボタンは `filterModal.test.tsx` でカバー済み

### e2e/movies/filterPersistence.spec.ts（フィルター永続化）

| テスト | 認証 | 説明 |
|---|---|---|
| リバイバル除外→リロード→復元確認 | 認証済み | PUT/GETのAPIレスポンス検証・UI復元確認 |

### e2e/movies/watchlistButton.spec.ts（ウォッチリスト状態同期）

| テスト | 認証 | 説明 |
|---|---|---|
| ボタンクリックでラベルが切り替わる | 認証済み | API呼び出し → 追加↔削除のトグル・クリーンアップ |
| モーダル内でラベルが切り替わる | 認証済み | モーダル内API呼び出し → トグル・クリーンアップ |
| モーダルで追加後タイル側も同期される | 認証済み | モーダル↔タイル間のZustand状態同期 |

> ボタン表示・aria-label確認・stopPropagation・ページ横断表示は `movieListContent.test.tsx`, `movieDetailContent.test.tsx` でカバー済み

### e2e/watchlist/watchlist.spec.ts（ウォッチリストページ）

| テスト | 認証 | 説明 |
|---|---|---|
| ページ表示・詳細モーダル | 認証済み | ウォッチリスト追加済み映画の表示確認 → タイルクリックで詳細モーダル表示 |
| ページで削除 | 認証済み | 削除ボタンクリック → API呼び出し → 空状態メッセージ表示 |
| サイドバー「すべて見る」遷移 | 認証済み | サイドバーの「すべて見る」リンクから `/watchlist` ページに遷移 |

> タイル表示・空状態メッセージ・スケルトン・ソートセレクトは `watchlistPage.test.tsx`, `watchlistList.test.tsx` でカバー済み
### e2e/settings/settings.spec.ts（設定）

#### 設定ページ（認証済み）— テーマ切り替え

| テスト | 認証 | 説明 |
|---|---|---|
| テーマ切り替えでdata-theme属性が変わる | 認証済み | 「ダーク」選択で `html[data-theme="dark"]` に変更（Radix UI Selectの操作はjsdom非対応のためE2E） |

> セクション表示・パスワードバリデーション・表示名バリデーション・通知トグル・テーマ表示は `settingsPage.test.tsx`, `changePasswordForm.test.tsx`, `displayNameForm.test.tsx`, `notificationSettings.test.tsx`, `themeSettings.test.tsx` に移行済み

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

> 共有テストユーザーは run ごとに作って消すため、固定ユーザーの認証情報
> （旧 `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD`）は不要になった（#793）。

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
