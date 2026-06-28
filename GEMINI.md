# Movie App - Gemini AI レビューガイド

Gemini CLI がこのリポジトリでレビュー・分類・質問対応を行う際の指針。

## プロジェクト概要

映画ウォッチリスト管理アプリケーション（Next.js 16 + React 19 + TypeScript + Supabase + NextAuth.js）。

## レビュー観点（PRレビュー時の優先事項）

### 必須チェック項目

#### React コンポーネント

- `React.memo` ですべてのコンポーネントをラップしているか
- イベントハンドラーに `useCallback` を使っているか
- 計算コストの高い処理に `useMemo` を使っているか
- `displayName` が設定されているか
- ロジックがカスタムフックに分離されているか
- UIライブラリは Radix UI を使っているか
- クラス名結合は `cn()` ヘルパー（`@/utils/cn`）を使っているか
- HTMLタグの直接スタイリング・セレクタを避けて独自クラス名を使っているか

#### アクセシビリティ

- WCAG AA 準拠
- 適切な ARIA 属性が付与されているか
- フォーカス表示があるか
- セマンティック HTML が使われているか

#### スタイリング（SCSS Modules）

- SCSS Modules を使っているか
- デザインシステム変数を使っているか（カラー・スペーシング等のハードコード禁止）
- アニメーションは最小限（opacity / transform 程度）か

#### API Route

- NextAuth.js による認証チェックがあるか
- DB-based レート制限が実装されているか
- 統一エラーレスポンス形式を使っているか

#### Supabase / DB

- スキーマ変更は `supabase/migrations/` のマイグレーションファイル経由か
- Row Level Security (RLS) が有効化されているか
- `public` スキーマのテーブルには適切な `GRANT` が付与されているか
  - ユーザー固有データ: `authenticated` + `service_role`
  - 公開マスターデータ: `anon` + `authenticated` + `service_role`
- UUID 主キー・論理削除（`deleted_at` カラム）に対応しているか

#### カスタムフック

- コールバック関数に `useCallback` を使っているか
- 計算コストの高い処理に `useMemo` を使っているか
- エラーハンドリングが実装されているか

#### テスト

- 機能追加時に対応する単体テストがあるか
- テストファイルが対象ファイルと同じディレクトリに `<filename>.test.ts(x)` で配置されているか
- アクセシビリティ優先クエリ（`getByRole`, `getByLabelText` 等）を使っているか
- カバレッジ 80% 以上を維持しているか

#### 命名規則

- ファイル名: lowerCamelCase（例: `movieCard.tsx`, `useMovieData.ts`）
- コンポーネント: PascalCase
- 変数・関数: lowerCamelCase
- API Route: kebab-case（例: `watchlist/add`）

### セキュリティ重点項目

- 環境変数・APIキーがハードコードされていないか
- ユーザー入力のバリデーション（zod 等）があるか
- SQL injection / XSS / CSRF への対策
- 認証チェックの抜けがないか
- タイミングセーフな比較（パスワード・トークン照合）

### 指摘の優先度

- **高**: セキュリティ脆弱性、認証バイパス、データ漏洩リスク、RLSの欠如
- **中**: 必須パターン（React.memo, useCallback等）の欠落、アクセシビリティ違反、テスト不足
- **低**: 命名規則の軽微なブレ、コメントの過不足

### 指摘しないこと

- コードコメント追加の提案（必要な場合のみコメントを書く方針）
- 過剰な抽象化・リファクタリングの提案
- 機能要件外の改善（「ついで」の修正は不要）
- **既に適用済みのパターンの「欠落」指摘**（`React.memo` / `useCallback` / `useMemo` / `displayName` 等）。これらは差分行の外でラップ・定義されていることが多い（`memo(...)` のラップ行、`useCallback` の定義行）。差分行だけで判断せず定義全体を確認し、適用済みなら指摘しない
- **確証のない推測ベースの指摘**（false positive を避ける。不明な場合は指摘しない）

## リポジトリ構成

- `src/app/` - Next.js App Router（ページ・API Routes）
- `src/components/` - React コンポーネント
- `src/hooks/` - カスタムフック
- `src/utils/` - ユーティリティ関数
- `src/types/` - 型定義（`database.types.ts` は自動生成のため編集禁止）
- `supabase/migrations/` - DB マイグレーション
- `.claude/rules/` - 詳細なコーディング規約（このファイルの元情報）
- `.claude/documents/` - 設計ドキュメント
