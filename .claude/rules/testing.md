---
description: テストファイル作成・編集時のルール（Jest + React Testing Library）
globs:
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# テスト作成ルール

## 【必須】配置・カバレッジ

- テストファイルは対象ファイルと同じディレクトリに `<filename>.test.ts(x)` で配置する
- テストカバレッジは全指標（Statements, Branches, Functions, Lines）で**80%以上**を維持する
- カバレッジが80%を下回る変更はPRに含めない

## 【必須】テスト手法

- アクセシビリティ優先クエリを使用する（getByRole, getByLabelText 等）
- ユーザーイベントシミュレーションには `@testing-library/user-event` を使用する
- コンポーネント・フック・API Routeそれぞれに対応するテストを作成する
