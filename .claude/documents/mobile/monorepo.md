# モノレポ化 方針・手順

## 概要

既存のNext.js（Web版）リポジトリに Flutter（iOS版）を追加するため、モノレポ構成に移行する。

---

## 最終的なディレクトリ構成

```
movie-app/                    # リポジトリルート
├── web/                      # Web版（Next.js）※既存コードを移動
│   ├── src/
│   ├── public/
│   ├── e2e/
│   ├── eslint-local-rules/
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── jest.config.js
│   ├── jest.setup.js
│   ├── playwright.config.ts
│   ├── vercel.json
│   ├── ignore-build-step.sh
│   ├── .prettierrc
│   ├── .prettierignore
│   ├── .env.local.example
│   ├── .env.example
│   └── ...
├── mobile/                   # iOS版（Flutter）※新規作成
│   ├── lib/
│   ├── ios/
│   ├── test/
│   ├── pubspec.yaml
│   └── ...
├── supabase/                 # 共通バックエンド（Web版・Flutter版で共有）
├── .claude/                  # 共通ドキュメント（現在位置のまま）
│   ├── CLAUDE.md
│   └── documents/
│       ├── architecture.md       # Web版アーキテクチャ
│       ├── api-specification.md  # 共通API仕様
│       ├── database-schema.md    # 共通DBスキーマ
│       ├── authentication-flow.md # 共通認証フロー
│       ├── design-system.md      # 共通デザインシステム
│       ├── components.md         # Web版コンポーネント
│       ├── environment-variables.md
│       ├── testing-strategy.md
│       ├── roadmap.md            # Web版ロードマップ
│       └── mobile/               # Flutter版ドキュメント
│           ├── architecture.md
│           ├── setup.md
│           ├── roadmap.md
│           ├── monorepo.md
│           ├── distribution.md
│           └── design-mapping.md
├── .github/                  # GitHub Actions ワークフロー
├── .vscode/                  # IDE設定
├── .mcp.json                 # Claude Code MCP設定
├── .gitignore                # ルートの.gitignore（共通設定）
└── README.md
```

---

## 移行手順

### Step 1: `web/` ディレクトリの作成と既存コード移動

**注意**: この操作はGitの履歴を保持するために `git mv` を使用する。

```bash
# リポジトリルートで実行
mkdir web

# Next.js関連のファイル・ディレクトリを移動
git mv src/ web/src/
git mv public/ web/public/
git mv e2e/ web/e2e/
git mv eslint-local-rules/ web/eslint-local-rules/
git mv package.json web/package.json
git mv package-lock.json web/package-lock.json
git mv next.config.mjs web/next.config.mjs
git mv tsconfig.json web/tsconfig.json
git mv next-env.d.ts web/next-env.d.ts
git mv eslint.config.mjs web/eslint.config.mjs
git mv jest.config.js web/jest.config.js
git mv jest.setup.js web/jest.setup.js
git mv playwright.config.ts web/playwright.config.ts
git mv vercel.json web/vercel.json
git mv ignore-build-step.sh web/ignore-build-step.sh
git mv .prettierrc web/.prettierrc
git mv .prettierignore web/.prettierignore
git mv .env.local.example web/.env.local.example
git mv .env.example web/.env.example
```

**手動対応（gitの追跡外）:**
```bash
mv .env.local web/.env.local    # .gitignore対象のため git mv 不要
mv .env web/.env                # .gitignore対象のため git mv 不要
```

**移動しないファイル（ルートに残す）:**

| ファイル/ディレクトリ | 理由 |
|---------|------|
| `.claude/` | 共通ドキュメント（Web版・Flutter版で共有） |
| `.git/` | Git管理（移動不可） |
| `.github/` | GitHub Actions ワークフロー |
| `.gitignore` | ルートで管理（内容を更新） |
| `.mcp.json` | Claude Code MCP設定 |
| `.vscode/` | リポジトリ全体のIDE設定 |
| `supabase/` | 共通バックエンド（Web版・Flutter版で共有） |
| `README.md` | リポジトリ全体の説明（内容を更新） |

### Step 2: `.gitignore` の更新

ルートの `.gitignore` にFlutter関連の除外設定を追加：

```gitignore
# ==================
# Web (Next.js)
# ==================
web/node_modules/
web/.next/
web/.env.local
web/.env

# ==================
# Mobile (Flutter)
# ==================
mobile/.dart_tool/
mobile/.packages
mobile/build/
mobile/.env
mobile/ios/Pods/
mobile/ios/.symlinks/
mobile/ios/Flutter/Flutter.framework
mobile/ios/Flutter/Flutter.podspec
mobile/.flutter-plugins
mobile/.flutter-plugins-dependencies
mobile/ios/Runner.xcworkspace/xcshareddata/
mobile/ios/Runner.xcworkspace/xcuserdata/

# ==================
# 共通
# ==================
.DS_Store
*.log
```

### Step 3: Web版の動作確認

```bash
cd web
npm install   # node_modules を再生成
npm run dev   # 開発サーバーが起動することを確認
npm run build # ビルドが通ることを確認
npm test      # テストが通ることを確認
```

### Step 4: Vercel 設定変更

Vercelダッシュボードで以下を変更：

1. **Settings > General > Root Directory**
   - 値を `web` に変更

2. **Settings > Git > Ignored Build Step**（任意）
   - コマンドを入力: `git diff HEAD^ HEAD --quiet ./web/`
   - これにより `mobile/` の変更時はデプロイがスキップされる

3. **デプロイ確認**
   - 変更後、テストプッシュして正常にデプロイされることを確認

### Step 5: Flutter プロジェクト作成

```bash
# リポジトリルートで実行
flutter create --org com.fukumi --project-name movie_app mobile
```

### Step 6: コミット

```bash
git add -A
git commit -m "refactor: モノレポ構成に移行（web/ + mobile/）"
```

---

## 注意事項

### パスの変更による影響（調査結果）

Web版の設定ファイルはすべて相対パスを使用しているため、`web/` に移動しても内部のパス参照を変更する必要はない。

#### 変更不要なファイル（相対パスのため移動のみでOK）

| ファイル | パス参照 | 影響 |
|---------|---------|------|
| `next.config.mjs` | `sassOptions` で `'./src/styles'` を参照 | 相対パスのため問題なし |
| `tsconfig.json` | `paths` の `"@/*": ["./src/*"]` | 相対パスのため問題なし |
| `jest.config.js` | `moduleNameMapper`, `testMatch` 等すべて相対パス | 問題なし |
| `jest.setup.js` | パス参照なし | 問題なし |
| `eslint.config.mjs` | `tsconfig.json` を相対参照 | 問題なし |
| `playwright.config.ts` | `testDir`, `dotenv` パス等すべて相対 | 問題なし |
| `.prettierrc` | パス参照なし | 問題なし |
| `.prettierignore` | パス参照なし | 問題なし |
| `package.json` | スクリプトはすべて相対パスで実行 | 問題なし |
| `vercel.json` | Vercel設定 | 問題なし |
| `src/` 内の `@/` インポート | `tsconfig.json` で解決されるため | 問題なし |

#### 更新が必要なファイル

| ファイル | 変更内容 |
|---------|---------|
| `.gitignore`（ルート） | Web版のエントリに `web/` プレフィックス追加、Flutter用エントリ追加 |
| `.github/workflows/*` | paths フィルター、working-directory、キャッシュパス等（後述のセクション参照） |

### CLAUDE.md の更新

モノレポ化後、`.claude/CLAUDE.md` のドキュメント参照パスは変更不要（`.claude/documents/` はルートに残すため）。

ただし、Web版のコマンド実行時は `cd web` が必要になるため、開発ワークフローのセクションに注記を追加する。

### ブランチ戦略

モノレポでもブランチ命名規則は同じ。Web版とFlutter版の区別が必要な場合：

```
feature/web-xxx     # Web版の機能
feature/mobile-xxx  # Flutter版の機能
feature/shared-xxx  # 共通の変更
```

---

## GitHub Actions のスコープ変更

モノレポ化により、既存の4つのワークフローを修正する必要がある。
Web版の変更時のみ実行されるようにスコープを絞り、作業ディレクトリを `web/` に変更する。

### 変更対象ファイル

| ファイル | ワークフロー名 | 変更内容 |
|---------|--------------|---------|
| `.github/workflows/build.yml` | Next.js Build | paths + working-directory |
| `.github/workflows/code-quality.yml` | ESLint / Prettier / TypeScript Check | paths + working-directory |
| `.github/workflows/test.yml` | Jest Test / Coverage | paths + working-directory |
| `.github/workflows/e2e.yml` | Playwright E2E | paths + working-directory |

### 変更1: `paths` フィルターの追加

全ワークフローの `on` セクションに `paths` を追加し、`web/` 配下の変更時のみ実行されるようにする。

**変更前（全ワークフロー共通）:**
```yaml
on:
  pull_request:
    branches:
      - main
      - develop
      - 'feature/**'
      - 'release/**'
```

**変更後:**
```yaml
on:
  pull_request:
    branches:
      - main
      - develop
      - 'feature/**'
      - 'release/**'
    paths:
      - 'web/**'
      - '.github/workflows/**'
```

**test.yml / e2e.yml の `push` トリガーも同様:**
```yaml
  push:
    branches:
      - main
    paths:
      - 'web/**'
      - '.github/workflows/**'
```

### 変更2: `defaults.run.working-directory` の追加

全ワークフローの各ジョブに `defaults.run.working-directory` を追加し、npm/npxコマンドが `web/` で実行されるようにする。

**各ジョブに追加:**
```yaml
jobs:
  build:
    name: Next.js Build
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      ...
```

### 変更3: キャッシュパスの更新

`package-lock.json` のパスが変わるため、キャッシュキーとパスを更新する。

**node_modules キャッシュ:**
```yaml
# 変更前
path: '**/node_modules'
key: ${{ runner.os }}-node-modules-${{ hashFiles('**/package-lock.json') }}

# 変更後
path: 'web/node_modules'
key: ${{ runner.os }}-node-modules-${{ hashFiles('web/package-lock.json') }}
```

**Next.js ビルドキャッシュ:**
```yaml
# 変更前
path: .next/cache
key: ...-${{ hashFiles('**.[jt]s', '**.[jt]sx') }}

# 変更後
path: web/.next/cache
key: ...-${{ hashFiles('web/**.[jt]s', 'web/**.[jt]sx') }}
```

### 変更4: `actions/setup-node` の cache-dependency-path

```yaml
# 変更前
- name: setup-node
  uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm

# 変更後
- name: setup-node
  uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm
    cache-dependency-path: web/package-lock.json
```

### 変更5: Playwright 関連パス（e2e.yml）

```yaml
# レポートのアップロードパスを更新
- name: upload-playwright-report
  uses: actions/upload-artifact@v4
  with:
    path: web/playwright-report/

- name: upload-test-results
  uses: actions/upload-artifact@v4
  with:
    path: web/test-results/
```

### 完全な変更例（build.yml）

```yaml
name: Build

on:
  pull_request:
    branches:
      - main
      - develop
      - 'feature/**'
      - 'release/**'
    paths:
      - 'web/**'
      - '.github/workflows/**'

jobs:
  build:
    name: Next.js Build
    runs-on: ubuntu-latest
    environment: Production
    defaults:
      run:
        working-directory: web
    steps:
      - name: checkout
        uses: actions/checkout@v4

      - name: setup-node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Get date info
        id: date
        run: |
          echo "week=$(date +%Y-%V)" >> $GITHUB_OUTPUT

      - name: cache-node-modules
        uses: actions/cache@v4
        id: node_modules_cache
        with:
          path: 'web/node_modules'
          key: ${{ runner.os }}-node-modules-${{ hashFiles('web/package-lock.json') }}

      - name: cache-nextjs-build
        uses: actions/cache@v4
        with:
          path: web/.next/cache
          key: ${{ runner.os }}-nextjs-build-${{ steps.date.outputs.week }}-${{ hashFiles('web/package-lock.json') }}-${{ hashFiles('web/**.[jt]s', 'web/**.[jt]sx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-build-${{ steps.date.outputs.week }}-

      - name: npm-install
        if: ${{ steps.node_modules_cache.outputs.cache-hit != 'true' }}
        run: npm ci

      - name: app-build
        run: npm run build
        env:
          NEXT_TELEMETRY_DISABLED: 1
          NEXT_PUBLIC_TMDB_API_KEY: ${{ secrets.NEXT_PUBLIC_TMDB_API_KEY }}

      - name: Clear old cache
        run: |
          find .next/cache -type f -mtime +30 -delete 2>/dev/null || true
```

### 将来: Flutter用ワークフローの追加

Flutter版のCI/CDが必要になった場合、別途ワークフローを追加する：

```
.github/workflows/
├── build.yml           # Web版ビルド
├── code-quality.yml    # Web版コード品質
├── test.yml            # Web版テスト
├── e2e.yml             # Web版E2E
└── flutter-test.yml    # Flutter版テスト（将来追加）
```

Flutter用ワークフローでは `paths: ['mobile/**']` を指定し、`mobile/` の変更時のみ実行する。
