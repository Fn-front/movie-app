# Movie App - Claude Code プロジェクトガイド

このプロジェクトは映画ウォッチリスト管理アプリケーションです。

## 開発路ロードマップ
`.claude/documents/roadmap.md`を参照
## 利用可能なSkills

プロジェクト固有のskillsが利用可能です：

- `/component` - Reactコンポーネント作成
  - React.memo + useCallback必須
  - Radix UI使用
  - ロジックはhooksに分離
  - クラス名結合は `cn()` ヘルパー（`@/utils/cn`）を使用（内部でclsxを利用）

- `/api-route` - Next.js API Route作成
  - 統一エラーレスポンス形式
  - DB-basedレート制限
  - NextAuth.js認証チェック

- `/db-schema` - Supabaseテーブル定義作成
  - Row Level Security (RLS)必須
  - UUID主キー
  - 論理削除対応

- `/design-check` - デザインシステム準拠チェック
  - カラーパレット変数使用確認
  - アクセシビリティチェック（WCAG AA）
  - SCSS記法チェック

- `/form` - react-hook-form + zodフォーム作成
  - zodスキーマ定義
  - エラーメッセージ表示
  - アクセシビリティ対応

- `/page` - Next.js App Routerページ作成
  - Server/Client Component
  - メタデータ設定
  - loading/error/not-foundページ

- `/test` - Jest + React Testing Libraryテスト作成
  - コンポーネント/フック/API Routeテスト
  - アクセシビリティ優先クエリ
  - ユーザーイベントシミュレーション

- `/custom-hook` - カスタムフック作成
  - useCallback/useMemo必須
  - エラーハンドリング
  - パフォーマンス最適化

- `/tmdb-api` - TMDb API統合
  - axiosインスタンス設定
  - よく使うエンドポイント
  - レート制限対策（50req/s）
  - 型定義・エラーハンドリング

- `/middleware` - Next.js Middleware作成
  - 認証チェック（NextAuth.js）
  - リダイレクト処理
  - Cookie/Header操作
  - matcher設定

- `/server-action` - Next.js Server Actions作成
  - フォーム送信処理
  - zodバリデーション
  - revalidate処理
  - 統一レスポンス形式

- `/supabase-client` - Supabaseクライアント操作
  - クライアント作成（anon/service role）
  - CRUD操作・フィルタリング
  - RLS対応クエリパターン
  - エラーハンドリング

## 開発ワークフロー

### Git運用

**【必須】ブランチ作成ルール**：
- 作業開始時、必ず新しいブランチを作成してから作業を進める
- mainブランチで直接作業しない
- ブランチがない場合は必ず作成を促す

**ブランチ命名規則**：
- 機能追加: `feature/<feature-name>`
- バグ修正: `fix/<bug-name>`
- 設定変更: `setup/<setup-name>`
- アップグレード: `upgrade/<package-name>`
- クリーンアップ: `cleanup/<cleanup-name>`

**【必須】PR作成ルール**：
- PR作成時は必ず`--assignee Fn-front`を指定してアサインする
- 例: `gh pr create --title "タイトル" --body "本文" --assignee Fn-front`

**【必須】PR概要の構成**：
```markdown
## 概要
<!-- 何を行ったか -->

## ロードマップ
<!-- 完了したロードマップのタスク -->

## レビューポイント
<!-- レビュー時に注目してほしい点 -->

## テスト
<!-- テスト状況・確認項目 -->
```

**【必須】ロードマップ更新ルール**：
- ロードマップ（`.claude/documents/roadmap.md`）のタスクが完了したら、必ずチェックボックスを更新する
- `- [ ]` → `- [x]` に変更してコミットに含める

**【必須】GitHub Issue運用ルール**：
- 個別タスク（機能開発・バグ修正・改善等）はGitHub Issueで管理する
- ロードマップには概要とIssue番号の参照のみ記載し、詳細はIssueに書く
- PR本文に `Closes #xxx` を記載してIssueとPRをDevelopmentで紐づける
- 完了済みタスクもIssueとして作成し、対応PRの `Closes` で紐づけてからクローズする
- ラベルで優先度（`P0: critical` / `P1: important` / `P2: nice-to-have`）とカテゴリ（`security` / `performance` / `ui/ux` / `testing` / `database` / `refactor` / `feature` / `deploy` / `documentation`）を付与する

**【必須】ブランチ削除ルール**：
- PRマージ後、マージ済みブランチはリモート・ローカル共に削除する
- `gh pr merge`時に`--delete-branch`を使用する
- mainブランチに切り替えてからローカルブランチを削除

**【必須】テスト作成ルール**：
- 機能開発時は対応する単体テストも一緒に作成する
- 詳細は `.claude/rules/testing.md` を参照

**作業フロー**：
1. ブランチ作成 → 2. 実装 → 3. テスト作成 → 4. コミット → 5. ロードマップ更新 → 6. PR作成 → 7. マージ → 8. ブランチ削除

### Worktree（並行作業）— Claude Code向けルール

**【推奨】Worktree使用ルール**：
- 複数Issueを並行作業する場合、Agentツールの `isolation: "worktree"` を使用する
- Worktreeにより現在の作業ツリーを汚さずに独立したブランチで作業可能

**使い分け**：
- 独立したIssue（依存関係なし）→ Worktreeで並行作業
- 依存関係のあるIssue → 順次対応（1つ完了後に次へ進める）

### バックグラウンドタスク活用 — Claude Code向けルール

**【推奨】バックグラウンド実行**：
- 長時間タスク（全テスト実行、E2Eテスト、CI結果待ち等）はBashツールの `run_in_background: true` で実行する
- 完了時に自動通知されるため、ポーリングやsleepは不要
- メインの会話でユーザーとの対話や別の作業を継続できる

**活用シーン**：
- `npx jest --coverage` 実行中に次のファイル編集を進める
- CI結果待ち中にドキュメント更新や次のIssue準備
- E2Eテスト実行中にコードレビュー対応

## 設計ドキュメント

詳細な設計仕様は`.claude/documents/`を参照：

- `architecture.md` - システムアーキテクチャ
- `api-specification.md` - API仕様
- `authentication-flow.md` - 認証フロー
- `database-schema.md` - データベーススキーマ
- `design-system.md` - デザインシステム
- `environment-variables.md` - 環境変数
- `components.md` - コンポーネント仕様
- `testing-strategy.md` - テスト戦略
- `roadmap.md` - 開発ロードマップ

## コーディング規約

### 命名規則
- ファイル名: lowerCamelCase（例: `movieCard.tsx`, `useMovieData.ts`）
- コンポーネント: PascalCase（例: `MovieCard`）
- 変数・関数: lowerCamelCase（例: `handleClick`, `isLoading`）
- API Route: kebab-case（例: `watchlist/add`）

### ファイルタイプ別ルール
詳細は `.claude/rules/` 配下のルールファイルを参照：
- `react-component.md` - Reactコンポーネント規約（memo, useCallback, displayName等）
- `scss-styling.md` - スタイリングルール（SCSS Modules, デザインシステム変数）
- `testing.md` - テスト作成ルール（Jest + RTL, カバレッジ80%）
- `api-route.md` - API Routeルール（認証, レート制限, レスポンス形式）
- `custom-hook.md` - カスタムフックルール（useCallback/useMemo, エラーハンドリング）
- `supabase-db.md` - DB操作ルール（Supabase CLI, マイグレーション, 型生成）
