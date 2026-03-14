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
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── ...
├── mobile/                   # iOS版（Flutter）※新規作成
│   ├── lib/
│   ├── ios/
│   ├── test/
│   ├── pubspec.yaml
│   └── ...
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
git mv package.json web/package.json
git mv package-lock.json web/package-lock.json  # or yarn.lock / pnpm-lock.yaml
git mv next.config.ts web/next.config.ts
git mv tsconfig.json web/tsconfig.json
git mv next-env.d.ts web/next-env.d.ts
git mv postcss.config.mjs web/postcss.config.mjs  # 存在する場合
git mv jest.config.ts web/jest.config.ts
git mv .env.local.example web/.env.local.example
```

**移動対象の確認**: 実行前に `ls` でルートにあるNext.js関連ファイルを全て確認し、漏れなく移動する。以下は移動しないファイル：

- `.claude/` - 共通ドキュメント（ルートに残す）
- `.git/` - Git管理（移動不可）
- `.gitignore` - ルートに残す（内容を更新）
- `README.md` - ルートに残す（内容を更新）

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

### パスの変更による影響

Web版のコード内で相対パスを使用している箇所は影響を受けない（`src/` 内の参照は `web/src/` に移動しても相対パスのまま動作する）。

ただし以下は確認が必要：

| 対象 | 確認事項 |
|------|---------|
| `next.config.ts` | 特に問題なし（相対パス参照） |
| `tsconfig.json` | paths 設定の相対パスが `web/` 基準になるか確認 |
| `jest.config.ts` | テスト対象パスの確認 |
| `.env.local` | Web版は `web/.env.local` に配置 |
| CI/CD | Vercelの Root Directory 変更で対応 |

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
