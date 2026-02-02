# Movie App - Claude Code プロジェクトガイド

このプロジェクトは映画ウォッチリスト管理アプリケーションです。

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
