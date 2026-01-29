# デザインシステム

## カラーパレット

### プライマリカラー
映画・エンターテイメントをイメージした深みのある色

```scss
$primary-900: #1a0f2e;  // 最も濃い
$primary-800: #2d1b4e;
$primary-700: #3f276d;
$primary-600: #52348d;
$primary-500: #6441a5;  // メイン
$primary-400: #8566b8;
$primary-300: #a68cca;
$primary-200: #c7b2dd;
$primary-100: #e8d9ef;
$primary-50:  #f4edf7;   // 最も薄い
```

### セカンダリカラー
アクセント・強調用

```scss
$secondary-900: #b8860b;
$secondary-800: #d4a017;
$secondary-700: #f0b923;
$secondary-600: #ffc83d;  // メイン（ゴールド）
$secondary-500: #ffd35c;
$secondary-400: #ffde7c;
$secondary-300: #ffe99c;
$secondary-200: #fff4bd;
$secondary-100: #fffadd;
$secondary-50:  #fffef5;
```

### グレースケール
テキスト・背景・ボーダー用

```scss
$gray-900: #111111;  // ほぼ黒
$gray-800: #1f1f1f;
$gray-700: #2d2d2d;
$gray-600: #444444;
$gray-500: #6b6b6b;
$gray-400: #999999;
$gray-300: #c4c4c4;
$gray-200: #e0e0e0;
$gray-100: #f5f5f5;
$gray-50:  #fafafa;  // ほぼ白
```

### セマンティックカラー
状態・フィードバック用

```scss
// Success
$success-dark:  #0d7c4a;
$success-main:  #10b981;
$success-light: #6ee7b7;

// Warning
$warning-dark:  #d97706;
$warning-main:  #f59e0b;
$warning-light: #fbbf24;

// Error
$error-dark:    #b91c1c;
$error-main:    #ef4444;
$error-light:   #f87171;

// Info
$info-dark:     #1e40af;
$info-main:     #3b82f6;
$info-light:    #60a5fa;
```

---

## タイポグラフィ

### フォントファミリー
```scss
$font-family-base: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
$font-family-heading: 'Noto Sans JP', sans-serif;
$font-family-mono: 'Courier New', monospace;
```

### フォントサイズ
```scss
$font-size-xs:   0.75rem;   // 12px
$font-size-sm:   0.875rem;  // 14px
$font-size-base: 1rem;      // 16px
$font-size-lg:   1.125rem;  // 18px
$font-size-xl:   1.25rem;   // 20px
$font-size-2xl:  1.5rem;    // 24px
$font-size-3xl:  1.875rem;  // 30px
$font-size-4xl:  2.25rem;   // 36px
$font-size-5xl:  3rem;      // 48px
```

### フォントウェイト
```scss
$font-weight-light:   300;
$font-weight-regular: 400;
$font-weight-medium:  500;
$font-weight-bold:    700;
```

### 行間
```scss
$line-height-tight:  1.25;
$line-height-normal: 1.5;
$line-height-loose:  1.75;
```

---

## スペーシング

8pxベースのスペーシングシステム

```scss
$spacing-0:   0;
$spacing-1:   0.25rem;  // 4px
$spacing-2:   0.5rem;   // 8px
$spacing-3:   0.75rem;  // 12px
$spacing-4:   1rem;     // 16px
$spacing-5:   1.25rem;  // 20px
$spacing-6:   1.5rem;   // 24px
$spacing-8:   2rem;     // 32px
$spacing-10:  2.5rem;   // 40px
$spacing-12:  3rem;     // 48px
$spacing-16:  4rem;     // 64px
$spacing-20:  5rem;     // 80px
$spacing-24:  6rem;     // 96px
```

---

## ボーダー・角丸

### ボーダー幅
```scss
$border-width-0: 0;
$border-width-1: 1px;
$border-width-2: 2px;
$border-width-4: 4px;
```

### ボーダー半径（角丸）
```scss
$border-radius-none: 0;
$border-radius-sm:   0.125rem;  // 2px
$border-radius-md:   0.25rem;   // 4px
$border-radius-lg:   0.5rem;    // 8px
$border-radius-xl:   0.75rem;   // 12px
$border-radius-2xl:  1rem;      // 16px
$border-radius-full: 9999px;    // 完全な円
```

---

## シャドウ（影）

```scss
$shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
$shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1);
$shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1);
$shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1);
$shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
```

---

## ブレークポイント（レスポンシブ）

```scss
$breakpoint-sm:  640px;   // スマートフォン（横）
$breakpoint-md:  768px;   // タブレット（縦）
$breakpoint-lg:  1024px;  // タブレット（横）・小型ノートPC
$breakpoint-xl:  1280px;  // デスクトップ
$breakpoint-2xl: 1536px;  // 大型デスクトップ
```

---

## アニメーション・トランジション

### イージング
```scss
$ease-in:      cubic-bezier(0.4, 0, 1, 1);
$ease-out:     cubic-bezier(0, 0, 0.2, 1);
$ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);
```

### デュレーション
```scss
$duration-fast:   150ms;
$duration-normal: 300ms;
$duration-slow:   500ms;
```

### 基本トランジション
```scss
$transition-all:    all $duration-normal $ease-in-out;
$transition-color:  color $duration-fast $ease-in-out;
$transition-bg:     background-color $duration-fast $ease-in-out;
$transition-shadow: box-shadow $duration-normal $ease-in-out;
```

---

## Z-Index階層

```scss
$z-index-dropdown:  1000;
$z-index-sticky:    1020;
$z-index-fixed:     1030;
$z-index-modal-backdrop: 1040;
$z-index-modal:     1050;
$z-index-popover:   1060;
$z-index-tooltip:   1070;
```

---

## コンポーネント共通スタイル

### ボタン
```scss
.button {
  padding: $spacing-3 $spacing-6;
  font-size: $font-size-base;
  font-weight: $font-weight-medium;
  border-radius: $border-radius-md;
  transition: $transition-all;
  cursor: pointer;

  &-primary {
    background-color: $primary-500;
    color: white;
    &:hover { background-color: $primary-600; }
  }

  &-secondary {
    background-color: $secondary-600;
    color: $gray-900;
    &:hover { background-color: $secondary-700; }
  }

  &-outline {
    background-color: transparent;
    border: $border-width-2 solid $primary-500;
    color: $primary-500;
    &:hover { background-color: $primary-50; }
  }
}
```

### カード
```scss
.card {
  background-color: white;
  border-radius: $border-radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-6;
  transition: $transition-shadow;

  &:hover {
    box-shadow: $shadow-lg;
  }
}
```

### 入力フィールド
```scss
.input {
  width: 100%;
  padding: $spacing-3 $spacing-4;
  font-size: $font-size-base;
  border: $border-width-1 solid $gray-300;
  border-radius: $border-radius-md;
  transition: $transition-all;

  &:focus {
    outline: none;
    border-color: $primary-500;
    box-shadow: 0 0 0 3px rgba($primary-500, 0.1);
  }

  &.error {
    border-color: $error-main;
  }
}
```

---

## 確認が必要な事項

### カラーパレット
- [ ] **プライマリカラー**: 紫系でよいか？他の候補は？
- [ ] **セカンダリカラー**: ゴールドでよいか？
- [ ] **ダークモード**: 対応する？その場合の色設定は？

### タイポグラフィ
- [ ] **日本語フォント**: Noto Sans JPでよいか？他の候補は？
  - 候補: ヒラギノ角ゴ、游ゴシック、源ノ角ゴシック
- [ ] **欧文フォント**: システムフォントでよいか？
- [ ] **Webフォント**: Google Fonts使用？自己ホスティング？

### レスポンシブ
- [ ] **対応デバイス**: スマホ・タブレット・PCすべて対応？
- [ ] **最小対応幅**: 320pxから？375pxから？
- [ ] **モバイルファースト**: 設計方針は？

### アクセシビリティ
- [ ] **カラーコントラスト**: WCAG AA基準を満たしているか？
- [ ] **フォーカス表示**: キーボード操作時の視覚的フィードバックは？
- [ ] **ARIAラベル**: スクリーンリーダー対応は？

### パフォーマンス
- [ ] **Webフォント読み込み**: font-display設定は？
- [ ] **CSSファイルサイズ**: 最適化戦略は？
- [ ] **クリティカルCSS**: Above the fold最適化は？

### ブランディング
- [ ] **ロゴデザイン**: 決定しているか？
- [ ] **ファビコン**: 用意できているか？
- [ ] **OGP画像**: ソーシャルシェア用画像は？
