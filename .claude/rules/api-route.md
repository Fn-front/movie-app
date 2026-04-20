---
description: Next.js API Route作成・編集時のルール
globs:
  - "src/app/api/**"
---

# API Routeルール

## 【必須】認証・セキュリティ

- NextAuth.js による認証チェックを必ず行う
- DB-based レート制限を実装する

## 【必須】レスポンス形式

- 統一エラーレスポンス形式を使用する
