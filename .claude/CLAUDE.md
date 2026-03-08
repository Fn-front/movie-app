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

**【必須】ブランチ削除ルール**：
- PRマージ後、マージ済みブランチはリモート・ローカル共に削除する
- `gh pr merge`時に`--delete-branch`を使用する
- mainブランチに切り替えてからローカルブランチを削除

**【必須】テスト作成ルール**：
- 機能開発時は対応する単体テストも一緒に作成する
- テストファイルは対象ファイルと同じディレクトリに `<filename>.test.ts(x)` で配置
- テストカバレッジは全指標（Statements, Branches, Functions, Lines）で**80%以上**を維持する
- カバレッジが80%を下回る変更はPRに含めない

**作業フロー**：
1. ブランチ作成 → 2. 実装 → 3. テスト作成 → 4. コミット → 5. ロードマップ更新 → 6. PR作成 → 7. マージ → 8. ブランチ削除

## 設計ドキュメント

詳細な設計仕様は`.claude/documents/`を参照：

- `architecture.md` - システムアーキテクチャ
- `api-specification.md` - API仕様
- `authentication-flow.md` - 認証フロー
- `database-schema.md` - データベーススキーマ
- `design-system.md` - デザインシステム
- `environment-variables.md` - 環境変数
- `components.md` - コンポーネント仕様
- `roadmap.md` - 開発ロードマップ

## コーディング規約

### 命名規則
- ファイル名: lowerCamelCase（例: `movieCard.tsx`, `useMovieData.ts`）
- コンポーネント: PascalCase（例: `MovieCard`）
- 変数・関数: lowerCamelCase（例: `handleClick`, `isLoading`）
- API Route: kebab-case（例: `watchlist/add`）

### 必須パターン
- **React.memo**: すべてのコンポーネントで必須
- **useCallback**: すべてのイベントハンドラーで必須
- **useMemo**: 計算コストの高い処理で使用
- **displayName**: すべてのコンポーネントに設定

### スタイリング
- SCSS Modules使用
- HTML要素を直接スタイリングしない（独自クラス名必須）
- デザインシステム変数を使用（ハードコード禁止）
- アニメーションは最小限（opacity/transform程度）

### アクセシビリティ
- WCAG AA準拠
- 適切なARIA属性付与
- フォーカス表示必須
- セマンティックHTML使用
