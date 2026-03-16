# デザインシステム

**デザインコンセプト: クリーン&プロフェッショナル**
- シンプルで洗練された色使い
- 視認性の高いコントラスト
- ビジネスツールとしての信頼感
- ブルーを基調とした落ち着きと信頼性のあるデザイン

---

## 変数システム概要

SCSS変数はすべて `var(--xxx)` 形式でCSSカスタムプロパティを参照します。実際の値は `src/styles/global/_theme.scss` の `:root` ブロックで定義されています。ブレークポイントのみ `@media` クエリで使用するためSCSS変数の直値を維持しています。

```scss
// 例: _variables.scss の記述パターン
$primary-500: var(--primary-500);  // CSSカスタムプロパティを参照
$breakpoint-md: 768px;             // @media用なので直値のまま
```

---

## rem基準値

`html { font-size: 62.5%; }` を設定することで **1rem = 10px** として扱います（`src/styles/global/_global.scss`）。フォントサイズ・スペーシングの rem 値はすべてこの前提に基づいています。

```scss
// _theme.scss の例
--font-size-base: 1.6rem;  // = 16px
--spacing-4: 1.6rem;       // = 16px
```

---

## カラーパレット

### プライマリカラー（ブルー系）
メインアクション、リンク、重要な要素に使用

```scss
$primary-900: var(--primary-900);  // #004a7c  最も濃い
$primary-800: var(--primary-800);  // #005a94
$primary-700: var(--primary-700);  // #006bac
$primary-600: var(--primary-600);  // #0d7ec4
$primary-500: var(--primary-500);  // #1878b9  メイン（ブルー）
$primary-400: var(--primary-400);  // #4ca3dd
$primary-300: var(--primary-300);  // #75b7e5
$primary-200: var(--primary-200);  // #9ecbed
$primary-100: var(--primary-100);  // #c7dff5
$primary-50:  var(--primary-50);   // #e8f3fb  最も薄い
```

### セカンダリカラー（オレンジ系）
アクセント・強調・進行中ステータス用

```scss
$secondary-900: var(--secondary-900);  // #cc7700
$secondary-800: var(--secondary-800);  // #e68600
$secondary-700: var(--secondary-700);  // #ff9500
$secondary-600: var(--secondary-600);  // #ff9600  メイン（オレンジ）
$secondary-500: var(--secondary-500);  // #ffa31a
$secondary-400: var(--secondary-400);  // #ffb044
$secondary-300: var(--secondary-300);  // #ffbd6e
$secondary-200: var(--secondary-200);  // #ffca98
$secondary-100: var(--secondary-100);  // #ffd7c2
$secondary-50:  var(--secondary-50);   // #fff0e5
```

### ダークブルーグレー（ナビゲーション・サイドバー用）
ヘッダー・サイドバー・フッター用の落ち着いた色

```scss
$dark-blue-900: var(--dark-blue-900);  // #1a2332
$dark-blue-800: var(--dark-blue-800);  // #232d3f
$dark-blue-700: var(--dark-blue-700);  // #2d3748
$dark-blue-600: var(--dark-blue-600);  // #2f3e51  メイン（ナビゲーション・サイドバー）
$dark-blue-500: var(--dark-blue-500);  // #3d4f65
$dark-blue-400: var(--dark-blue-400);  // #546479
$dark-blue-300: var(--dark-blue-300);  // #6b798d
$dark-blue-200: var(--dark-blue-200);  // #8895a8
$dark-blue-100: var(--dark-blue-100);  // #a5b1c2
$dark-blue-50:  var(--dark-blue-50);   // #dce1e8
```

### グレースケール
テキスト・背景・ボーダー用

```scss
$gray-900: var(--gray-900);  // #111111  ほぼ黒
$gray-800: var(--gray-800);  // #1f1f1f
$gray-700: var(--gray-700);  // #2d2d2d
$gray-600: var(--gray-600);  // #444444
$gray-500: var(--gray-500);  // #6b6b6b
$gray-400: var(--gray-400);  // #999999
$gray-300: var(--gray-300);  // #c4c4c4
$gray-200: var(--gray-200);  // #e0e0e0
$gray-100: var(--gray-100);  // #f5f5f5
$gray-50:  var(--gray-50);   // #fafafa  ほぼ白
```

### セマンティックカラー
状態・フィードバック用

```scss
// Success
$success-dark:  var(--success-dark);   // #0d7c4a
$success-main:  var(--success-main);   // #10b981
$success-light: var(--success-light);  // #6ee7b7

// Warning
$warning-dark:  var(--warning-dark);   // #d97706
$warning-main:  var(--warning-main);   // #f59e0b
$warning-light: var(--warning-light);  // #fbbf24

// Error
$error-dark:    var(--error-dark);     // #b91c1c
$error-main:    var(--error-main);     // #ef4444
$error-light:   var(--error-light);    // #f87171

// Info
$info-dark:     var(--info-dark);      // #1e40af
$info-main:     var(--info-main);      // #3b82f6
$info-light:    var(--info-light);     // #60a5fa
```

### セマンティック変数（テーマ対応）
ライト/ダークモードで値が切り替わるセマンティック変数。`_variables.scss` から参照し、コンポーネントで使用する。

```scss
// テキストカラー
$text-primary:   var(--text-primary);    // ライト: #111111 / ダーク: #f5f5f5
$text-secondary: var(--text-secondary);  // ライト: #6b6b6b / ダーク: #999999
$text-disabled:  var(--text-disabled);   // ライト: #999999 / ダーク: #6b6b6b
$text-inverse:   var(--text-inverse);    // 常時: #ffffff

// 背景色
$background-default:   var(--background-default);   // ライト: #fafafa / ダーク: #111111
$background-paper:     var(--background-paper);     // ライト: #ffffff / ダーク: #1f1f1f
$background-secondary: var(--background-secondary); // ライト: #f5f5f5 / ダーク: #2d2d2d
$background-disabled:  var(--background-disabled);  // ライト: #f5f5f5

// オーバーレイ
$overlay-light:  var(--overlay-light);   // rgba(0,0,0,0.1)
$overlay-medium: var(--overlay-medium);  // rgba(0,0,0,0.5)
$overlay-dark:   var(--overlay-dark);    // rgba(0,0,0,0.6)
$overlay-darker: var(--overlay-darker);  // rgba(0,0,0,0.8)

// ボーダー
$border-color: var(--border-color);  // ライト: #c4c4c4 / ダーク: #444444
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

`html { font-size: 62.5%; }` により 1rem = 10px として計算します。

```scss
$font-size-2xs: var(--font-size-2xs);  // 1rem   = 10px  ※追加変数
$font-size-xs:  var(--font-size-xs);   // 1.2rem = 12px
$font-size-sm:  var(--font-size-sm);   // 1.4rem = 14px
$font-size-base: var(--font-size-base); // 1.6rem = 16px
$font-size-lg:  var(--font-size-lg);   // 1.8rem = 18px
$font-size-xl:  var(--font-size-xl);   // 2rem   = 20px
$font-size-2xl: var(--font-size-2xl);  // 2.4rem = 24px
$font-size-3xl: var(--font-size-3xl);  // 3rem   = 30px
$font-size-4xl: var(--font-size-4xl);  // 3.6rem = 36px
$font-size-5xl: var(--font-size-5xl);  // 4.8rem = 48px
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
$transition-all:            var(--transition-all);     // all 300ms ease-in-out
$transition-color:          var(--transition-color);   // color 150ms ease-in-out
$transition-bg:             var(--transition-bg);      // background-color 150ms ease-in-out
$transition-shadow:         var(--transition-shadow);  // box-shadow 300ms ease-in-out
$transition-duration-base:  var(--duration-normal);    // 300ms（汎用ショートハンド）
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

## マージンルール

**【必須】`margin-bottom` を使用しない**

要素間の余白は、自身の `margin-bottom` ではなく**次の兄弟要素の `margin-top`** で確保する。

```scss
// NG
.c_title {
  margin-bottom: $spacing-8;
}

// OK
.c_body {
  margin-top: $spacing-8;
}
```

**理由**:
- 要素の削除・並び替え時にマージンの崩れを防ぐ
- 各要素が自身の上側スペースを管理し、依存関係を単純化する

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
- [x] **プライマリカラー**: ブルー系（#1878b9）- 確定
- [x] **セカンダリカラー**: オレンジ系（#ff9600）- 確定
- [x] **ナビゲーション**: ダークブルーグレー（#2f3e51）- 確定
- [x] **ダークモード**: 実装済み（`[data-theme='dark']` セレクタで切り替え）

### ダークモード実装詳細
`src/styles/global/_theme.scss` に `[data-theme='dark']` セレクタを定義済み。`html` 要素に `data-theme="dark"` 属性を付与することで切り替わる。上書きするカスタムプロパティは以下の通り：

| 変数 | ライトモード | ダークモード |
|---|---|---|
| `--text-primary` | `--gray-900`（#111111） | `--gray-100`（#f5f5f5） |
| `--text-secondary` | `--gray-500`（#6b6b6b） | `--gray-400`（#999999） |
| `--text-disabled` | `--gray-400`（#999999） | `--gray-500`（#6b6b6b） |
| `--background-default` | `--gray-50`（#fafafa） | `--gray-900`（#111111） |
| `--background-paper` | `#ffffff` | `--gray-800`（#1f1f1f） |
| `--background-secondary` | `--gray-100`（#f5f5f5） | `--gray-700`（#2d2d2d） |
| `--border-color` | `--gray-300`（#c4c4c4） | `--gray-600`（#444444） |

### タイポグラフィ
- [x] **日本語フォント**: Noto Sans JP - 確定
- [x] **欧文フォント**: システムフォント（-apple-system, BlinkMacSystemFont, 'Segoe UI'）- 確定
- [x] **Webフォント**: Google Fonts使用 - 確定

### レスポンシブ
- [x] **対応デバイス**: PC・スマホに対応 - 確定
- [x] **最小対応幅**: 375pxから（iPhone SE基準）- 確定
- [x] **モバイルファースト**: モバイルファースト設計 - 確定

### アクセシビリティ
- [x] **カラーコントラスト**: WCAG AA基準を満たす - 確定
- [x] **フォーカス表示**: キーボード操作時の視覚的フィードバック実装 - 確定
- [x] **ARIAラベル**: スクリーンリーダー対応実装 - 確定

### パフォーマンス
- [ ] **Webフォント読み込み**: 未定（一旦なし）
- [ ] **CSSファイルサイズ**: 未定（一旦なし）
- [ ] **クリティカルCSS**: 未定（一旦なし）

### ブランディング
- [ ] **ロゴデザイン**: 未定（一旦なし）
- [ ] **ファビコン**: 未定（一旦なし）
- [ ] **OGP画像**: 未定（一旦なし）
