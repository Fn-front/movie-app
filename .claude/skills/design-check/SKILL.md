---
name: design-check
description: Check if code follows project design system and conventions
disable-model-invocation: true
argument-hint: [file-path]
---

# デザインシステム準拠チェックスキル

このスキルは、コードがプロジェクトのデザインシステムとコーディング規約に準拠しているかチェックします。

## チェック項目

### 1. カラーパレット準拠

#### プライマリカラー（ブルー系）

値は `src/styles/global/_theme.scss` の **CSS 変数**が正。SCSS 側
（`src/styles/_variables.scss`）はそれを参照しているだけ。

```scss
// src/styles/global/_theme.scss（抜粋）
--primary-900: #004a7c;
--primary-800: #005a94;
--primary-700: #006bac;
--primary-600: #0d7ec4;
--primary-500: #1878b9;  // メインカラー
--primary-400: #4ca3dd;
--primary-300: #75b7e5;
--primary-200: #9ecbed;
--primary-100: #c7dff5;
--primary-50:  #e8f3fb;
```

```scss
// src/styles/_variables.scss — SCSS からはこちらを使う
$primary-500: var(--primary-500);
```

⚠️ **ここに値をコピーしない。** テーマを変えたときに2箇所がズレ、
「変数を使っているのに色が合わない」という形でしか現れない。

#### セカンダリカラー（オレンジ系）

```scss
$secondary-50: #fff3e0;
$secondary-100: #ffe0b2;
$secondary-200: #ffcc80;
$secondary-300: #ffb74d;
$secondary-400: #ffa726;
$secondary-500: #ff9800;
$secondary-600: #ff9600;  // メインカラー
$secondary-700: #f57c00;
$secondary-800: #ef6c00;
$secondary-900: #e65100;
```

#### ダークブルーグレー（ナビゲーション・サイドバー用）

```scss
$dark-blue-50: #eceff1;
$dark-blue-100: #cfd8dc;
$dark-blue-200: #b0bec5;
$dark-blue-300: #90a4ae;
$dark-blue-400: #78909c;
$dark-blue-500: #607d8b;
$dark-blue-600: #2f3e51;  // メインカラー
$dark-blue-700: #455a64;
$dark-blue-800: #37474f;
$dark-blue-900: #263238;
```

#### チェックポイント

- ❌ **ハードコードされた色値を使用していないか**
  ```scss
  // NG
  background-color: #1878b9;
  color: #ff9600;

  // OK
  background-color: $primary-500;
  color: $secondary-600;
  ```

- ✅ **デザインシステムの変数を使用しているか**

### 2. タイポグラフィ

#### フォント

```scss
$font-family-base: 'Noto Sans JP', sans-serif;
```

#### チェックポイント

- ✅ **Noto Sans JPのみを使用しているか**
- ❌ **他のフォントファミリーを追加していないか**

### 3. レスポンシブデザイン

#### ブレークポイント

`src/styles/_variables.scss` にあるのは**この5つだけ**。

```scss
$breakpoint-sm: 640px;
$breakpoint-md: 768px;
$breakpoint-lg: 1024px;
$breakpoint-xl: 1280px;
$breakpoint-2xl: 1536px;
```

⛔ `$breakpoint-mobile` / `$breakpoint-tablet` / `$breakpoint-desktop` は
**存在しない**。書くと SCSS のコンパイルが落ちる。

⚠️ `@media` の中では CSS 変数が使えないため、ここだけ SCSS 変数のまま
維持している（`_variables.scss` のコメント）。

#### チェックポイント

- ✅ **375px（モバイル）で表示が崩れないか**
- ✅ **1024px以上（`$breakpoint-lg`）で適切にレイアウトされているか**
- ✅ **メディアクエリを使用しているか**

```scss
// 例
.container {
  padding: 8px;

  @media (min-width: $breakpoint-lg) {
    padding: 16px;
  }
}
```

### 4. アクセシビリティ

#### カラーコントラスト

- ✅ **WCAG AA準拠（コントラスト比4.5:1以上）**
- ✅ **テキストと背景のコントラストが十分か**

#### フォーカス表示

```scss
// フォーカス時のスタイルを明示
.button {
  &:focus-visible {
    outline: 2px solid $primary-500;
    outline-offset: 2px;
  }
}
```

#### ARIAラベル

```tsx
// 適切なARIA属性を付与
<button aria-label="映画を検索">
  <SearchIcon />
</button>

<input
  type="text"
  aria-label="検索キーワード"
  aria-describedby="search-help"
/>
```

#### チェックポイント

- ✅ **インタラクティブ要素にフォーカススタイルがあるか**
- ✅ **アイコンのみのボタンにaria-labelがあるか**
- ✅ **フォームフィールドに適切なラベルがあるか**

### 5. SCSS記法

#### クラス命名規則

```scss
// ✅ OK: シンプルなクラス名
.container { }
.title { }
.buttonPrimary { }
.inputField { }

// ❌ NG: HTML要素を直接スタイリング
div { }
h2 { }
button { }

// ❌ NG: BEM記法（使用しない）
.block__element--modifier { }
```

#### チェックポイント

- ✅ **独自のクラス名を付与しているか**
- ❌ **HTML要素を直接スタイリングしていないか**
- ❌ **BEM記法を使用していないか**
- ✅ **クラス名にHTML要素名を含めるのはOK**

### 6. アニメーション

#### 許可される範囲

```scss
// ✅ OK: opacity、transformの軽微な変化
.button {
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
}

.modal {
  transition: transform 0.3s ease;
  transform: translateY(-100%);

  &.isOpen {
    transform: translateY(0);
  }
}

// ❌ NG: 複雑なアニメーション
@keyframes complexAnimation {
  0% { /* ... */ }
  50% { /* ... */ }
  100% { /* ... */ }
}
```

#### チェックポイント

- ✅ **アニメーションは最小限か**
- ✅ **opacity、transformのみ使用しているか**
- ❌ **複雑なキーフレームアニメーションを使用していないか**
- ❌ **アニメーションライブラリを導入していないか**

### 7. コンポーネント設計

#### ロジック分離

```tsx
// ✅ OK: ロジックはカスタムフックに分離
const MovieCard = memo(({ movie }) => {
  const { isFavorite, handleToggleFavorite } = useMovieCard(movie);

  return (
    <div className={styles.card}>
      <button onClick={handleToggleFavorite}>
        {isFavorite ? 'お気に入り解除' : 'お気に入り登録'}
      </button>
    </div>
  );
});

// ❌ NG: ロジックがコンポーネント内に混在
const MovieCard = ({ movie }) => {
  const [isFavorite, setIsFavorite] = useState(false);

  const handleToggleFavorite = () => {
    // ビジネスロジック...
  };

  return (/* ... */);
};
```

#### パフォーマンス最適化

```tsx
// ✅ OK: React.memoとuseCallbackを使用
export const MovieCard = memo<MovieCardProps>(({ movie }) => {
  const handleClick = useCallback(() => {
    // ...
  }, [/* dependencies */]);

  return (/* ... */);
});

MovieCard.displayName = 'MovieCard';

// ❌ NG: メモ化なし
export const MovieCard = ({ movie }) => {
  const handleClick = () => {
    // ...
  };

  return (/* ... */);
};
```

#### チェックポイント

- ✅ **ロジックはカスタムフックに分離されているか**
- ✅ **React.memoを使用しているか**
- ✅ **useCallbackでハンドラーをメモ化しているか**
- ✅ **displayNameを設定しているか**
- ✅ **lowerCamelCase命名規則を使用しているか**

### 8. Radix UI使用

```tsx
// ✅ OK: Radix UIコンポーネントを使用
import * as Dialog from '@radix-ui/react-dialog';

const Modal = memo(() => {
  return (
    <Dialog.Root>
      <Dialog.Trigger>開く</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          {/* ... */}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

// ❌ NG: 独自実装のUIコンポーネント（Radix UIで提供されているもの）
const Modal = ({ isOpen, onClose, children }) => {
  // 独自のモーダル実装...
};
```

#### チェックポイント

- ✅ **Radix UIコンポーネントを優先的に使用しているか**
- ❌ **Radix UIにある機能を独自実装していないか**

## チェック実行

### 対象ファイル

- `src/components/**/*.tsx` - Reactコンポーネント
- `src/components/**/*.module.scss` - SCSSスタイル
- `src/app/**/*.tsx` - Appディレクトリのコンポーネント

### チェックフロー

1. **カラーパレット**: ハードコードされた色値がないか
2. **タイポグラフィ**: Noto Sans JP以外のフォントがないか
3. **レスポンシブ**: メディアクエリが適切か
4. **アクセシビリティ**: ARIA属性、フォーカススタイル
5. **SCSS記法**: HTML要素の直接スタイリングがないか
6. **アニメーション**: 複雑なアニメーションがないか
7. **コンポーネント設計**: ロジック分離、メモ化
8. **Radix UI**: 適切に使用されているか

### レポート形式

```markdown
## デザインシステムチェック結果

### ✅ 準拠項目
- カラーパレット変数を使用
- React.memoとuseCallbackでメモ化
- ARIAラベルを適切に付与

### ⚠️ 改善推奨項目
- `src/components/MovieCard/movieCard.module.scss:15` - ハードコードされた色値 `#1878b9` → `$primary-500` を使用
- `src/components/SearchBar/searchBar.tsx:23` - displayNameが未設定

### ❌ 必須修正項目
- `src/components/Modal/modal.module.scss:8` - HTML要素 `div` を直接スタイリング → クラス名を付与
- `src/components/Button/button.tsx:10` - React.memoを使用していない
```

## 参考ドキュメント

- `.claude/documents/design-system.md` - デザインシステム詳細
- `.claude/documents/architecture.md` - アーキテクチャ設計

## 使用例

```bash
# 特定のファイルをチェック
/design-check src/components/MovieCard/movieCard.tsx

# コンポーネントディレクトリ全体をチェック
/design-check src/components/
```
