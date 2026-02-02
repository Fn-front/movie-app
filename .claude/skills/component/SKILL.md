---
name: component
description: Create a React component following project conventions
disable-model-invocation: true
argument-hint: <componentName> [options]
---

# Reactコンポーネント作成スキル

このスキルは、プロジェクトのコーディング規約に従ってReactコンポーネントを作成します。

## 必須要件

### アーキテクチャ原則

- **ロジック分離**: ビジネスロジックは必ずカスタムフックに分離
- **パフォーマンス最適化**: `React.memo`と`useCallback`を必ず使用
- **UI基盤**: Radix UIコンポーネントを優先的に使用
- **命名規則**: lowerCamelCase（例: `movieCard.tsx`, `useMovieData.ts`）

### ファイル構成

```
src/components/<componentName>/
├── <componentName>.tsx         # メインコンポーネント
├── <componentName>.module.scss  # スタイル（必要な場合）
├── hooks/                       # カスタムフック（必要な場合）
│   └── use<ComponentName>.ts
├── types/                       # 型定義（必要な場合）
│   └── index.ts
├── utils/                       # ユーティリティ関数（必要な場合）
│   └── index.ts
└── constants/                   # 定数（必要な場合）
    └── index.ts
```

### コンポーネントテンプレート

```typescript
import React, { memo } from 'react';
import styles from './<componentName>.module.scss';

interface <ComponentName>Props {
  // propsの型定義
}

export const <ComponentName> = memo<<ComponentName>Props>(({
  // props
}) => {
  // カスタムフックを使用してロジックを分離
  // const { state, handlers } = use<ComponentName>(props);

  return (
    <div className={styles.container}>
      {/* JSX */}
    </div>
  );
});

<ComponentName>.displayName = '<ComponentName>';
```

### カスタムフックテンプレート

```typescript
import { useCallback, useMemo } from 'react';

interface Use<ComponentName>Props {
  // フックが受け取るprops
}

export const use<ComponentName> = (props: Use<ComponentName>Props) => {
  // ステート管理

  // イベントハンドラーは必ずuseCallbackでメモ化
  const handleClick = useCallback(() => {
    // ハンドラーロジック
  }, [/* dependencies */]);

  // 計算結果は必要に応じてuseMemoでメモ化
  const computedValue = useMemo(() => {
    // 計算ロジック
  }, [/* dependencies */]);

  return {
    // 必要なステートとハンドラーを返す
    handleClick,
    computedValue,
  };
};
```

## スタイリング規則

### SCSS命名規則

- **BEM記法を使用しない**: シンプルなクラス名を使用
- **HTML要素を直接スタイリングしない**: 必ず独自のクラス名を付与
- **クラス名にHTML要素名を含めるのはOK**: 例: `.buttonPrimary`, `.inputField`

```scss
// ✅ 良い例
.container {
  padding: 16px;
}

.title {
  font-size: 24px;
}

.buttonPrimary {
  background-color: var(--primary-500);
}

// ❌ 悪い例
div {
  padding: 16px;
}

h2 {
  font-size: 24px;
}
```

### デザインシステム変数

デザインシステムの色変数を使用してください：

```scss
// プライマリカラー（ブルー系）
$primary-500: #2390d6;

// セカンダリカラー（オレンジ系）
$secondary-600: #ff9600;

// ダークブルーグレー（ナビゲーション・サイドバー用）
$dark-blue-600: #2f3e51;
```

詳細は `.claude/documents/design-system.md` を参照してください。

## アニメーション

- **最小限に抑える**: 基本的にアニメーションは使用しない
- **許容される範囲**: `opacity`、`transform`程度の軽微な変化のみ
- **禁止**: 複雑なアニメーションライブラリの使用

## アクセシビリティ

- **WAI-ARIA**: 適切なARIAラベルを付与
- **フォーカス管理**: キーボード操作に対応
- **カラーコントラスト**: WCAG AA準拠

## Radix UI使用例

```typescript
import * as Dialog from '@radix-ui/react-dialog';

export const Modal = memo(() => {
  return (
    <Dialog.Root>
      <Dialog.Trigger>Open</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title>Title</Dialog.Title>
          <Dialog.Description>Description</Dialog.Description>
          {/* コンテンツ */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
```

## 実行手順

1. コンポーネント名を確認（lowerCamelCase）
2. ディレクトリ構造を作成
3. TypeScript strict modeに準拠した型定義
4. ロジックをカスタムフックに分離
5. React.memoとuseCallbackを適用
6. 必要に応じてRadix UIコンポーネントを使用
7. SCSSスタイルを作成（デザインシステム変数使用）
8. displayNameを設定

## 参考ドキュメント

プロジェクトの詳細な設計仕様は以下を参照：

- `.claude/documents/architecture.md` - アーキテクチャ設計
- `.claude/documents/design-system.md` - デザインシステム
- `.claude/documents/component-patterns.md` - コンポーネントパターン（存在する場合）

## 使用例

```bash
# モーダルコンポーネントを作成
/component movieDetailModal

# 引数付きで作成
/component searchBar --with-hooks
```
