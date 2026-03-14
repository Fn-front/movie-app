# Web版デザインの Flutter マッピング

## 概要

Web版のデザインシステム（`design-system.md`）をFlutterの `ThemeData` に変換するためのマッピング。
デザインの見た目はWeb版と同じ感じを目指すが、レイアウトはモバイルに最適化する。

---

## カラーパレット

### Web版 SCSS変数 → Flutter Color

```dart
// config/theme.dart

// Primary（ブルー系）
static const primary900 = Color(0xFF004A7C);
static const primary800 = Color(0xFF005A94);
static const primary700 = Color(0xFF006BAC);
static const primary600 = Color(0xFF0D7EC4);
static const primary500 = Color(0xFF2390D6); // メイン
static const primary400 = Color(0xFF4CA3DD);
static const primary300 = Color(0xFF75B7E5);
static const primary200 = Color(0xFF9ECBED);
static const primary100 = Color(0xFFC7DFF5);
static const primary50  = Color(0xFFE8F3FB);

// Secondary（オレンジ系）
static const secondary900 = Color(0xFFCC7700);
static const secondary800 = Color(0xFFE68600);
static const secondary700 = Color(0xFFFF9500);
static const secondary600 = Color(0xFFFF9600); // メイン
static const secondary500 = Color(0xFFFFA31A);
static const secondary400 = Color(0xFFFFB044);
static const secondary300 = Color(0xFFFFBD6E);
static const secondary200 = Color(0xFFFFCA98);
static const secondary100 = Color(0xFFFFD7C2);
static const secondary50  = Color(0xFFFFF0E5);

// Dark Blue Gray（ナビゲーション用）
static const darkBlue900 = Color(0xFF1A2332);
static const darkBlue800 = Color(0xFF232D3F);
static const darkBlue700 = Color(0xFF2D3748);
static const darkBlue600 = Color(0xFF2F3E51); // メイン
static const darkBlue500 = Color(0xFF3D4F65);
static const darkBlue400 = Color(0xFF546479);
static const darkBlue300 = Color(0xFF6B798D);
static const darkBlue200 = Color(0xFF8895A8);
static const darkBlue100 = Color(0xFFA5B1C2);
static const darkBlue50  = Color(0xFFDCE1E8);

// Grayscale
static const gray900 = Color(0xFF111111);
static const gray800 = Color(0xFF1F1F1F);
static const gray700 = Color(0xFF2D2D2D);
static const gray600 = Color(0xFF444444);
static const gray500 = Color(0xFF6B6B6B);
static const gray400 = Color(0xFF999999);
static const gray300 = Color(0xFFC4C4C4);
static const gray200 = Color(0xFFE0E0E0);
static const gray100 = Color(0xFFF5F5F5);
static const gray50  = Color(0xFFFAFAFA);

// Semantic
static const successDark  = Color(0xFF0D7C4A);
static const successMain  = Color(0xFF10B981);
static const successLight = Color(0xFF6EE7B7);
static const warningDark  = Color(0xFFD97706);
static const warningMain  = Color(0xFFF59E0B);
static const warningLight = Color(0xFFFBBF24);
static const errorDark    = Color(0xFFB91C1C);
static const errorMain    = Color(0xFFEF4444);
static const errorLight   = Color(0xFFF87171);
static const infoDark     = Color(0xFF1E40AF);
static const infoMain     = Color(0xFF3B82F6);
static const infoLight    = Color(0xFF60A5FA);
```

---

## タイポグラフィ

### フォントファミリー

```dart
// Google Fonts パッケージを使用
// pubspec.yaml に google_fonts を追加

import 'package:google_fonts/google_fonts.dart';

final textTheme = GoogleFonts.notoSansJpTextTheme();
```

### フォントサイズ

| Web版 | サイズ | Flutter TextStyle |
|-------|--------|-------------------|
| `$font-size-xs` | 12px | `fontSize: 12` |
| `$font-size-sm` | 14px | `fontSize: 14` |
| `$font-size-base` | 16px | `fontSize: 16` |
| `$font-size-lg` | 18px | `fontSize: 18` |
| `$font-size-xl` | 20px | `fontSize: 20` |
| `$font-size-2xl` | 24px | `fontSize: 24` |
| `$font-size-3xl` | 30px | `fontSize: 30` |
| `$font-size-4xl` | 36px | `fontSize: 36` |
| `$font-size-5xl` | 48px | `fontSize: 48` |

### フォントウェイト

| Web版 | Flutter |
|-------|---------|
| `$font-weight-light` (300) | `FontWeight.w300` |
| `$font-weight-regular` (400) | `FontWeight.w400` |
| `$font-weight-medium` (500) | `FontWeight.w500` |
| `$font-weight-bold` (700) | `FontWeight.w700` |

---

## スペーシング

```dart
// config/constants.dart

class AppSpacing {
  static const double s0  = 0;
  static const double s1  = 4;
  static const double s2  = 8;
  static const double s3  = 12;
  static const double s4  = 16;
  static const double s5  = 20;
  static const double s6  = 24;
  static const double s8  = 32;
  static const double s10 = 40;
  static const double s12 = 48;
  static const double s16 = 64;
  static const double s20 = 80;
  static const double s24 = 96;
}
```

---

## ボーダー・角丸

```dart
class AppBorderRadius {
  static const double none = 0;
  static const double sm   = 2;
  static const double md   = 4;
  static const double lg   = 8;
  static const double xl   = 12;
  static const double xxl  = 16;
  static const double full = 9999;
}
```

---

## シャドウ

```dart
class AppShadow {
  static const sm = [BoxShadow(offset: Offset(0, 1), blurRadius: 2, color: Color(0x0D000000))];
  static const md = [BoxShadow(offset: Offset(0, 4), blurRadius: 6, spreadRadius: -1, color: Color(0x1A000000))];
  static const lg = [BoxShadow(offset: Offset(0, 10), blurRadius: 15, spreadRadius: -3, color: Color(0x1A000000))];
  static const xl = [BoxShadow(offset: Offset(0, 20), blurRadius: 25, spreadRadius: -5, color: Color(0x1A000000))];
}
```

---

## コンポーネントマッピング

### 共通コンポーネント

| Web版 (React + Radix UI) | Flutter版 | 備考 |
|--------------------------|-----------|------|
| Button | AppButton (ElevatedButton / OutlinedButton / TextButton) | variant対応 |
| Input | AppInput (TextField) | InputDecoration でスタイリング |
| Select | AppSelect (DropdownButton / DropdownMenu) | |
| Card | AppCard (Card) | |
| Modal / Dialog | AppModal (showModalBottomSheet / showDialog) | モバイルはBottomSheet推奨 |
| Toast | AppToast (SnackBar) | ScaffoldMessenger経由 |
| Loading | AppLoading (CircularProgressIndicator + Overlay) | 全画面対応 |
| Avatar | AppAvatar (CircleAvatar) | |
| Skeleton | Shimmer (shimmerパッケージ) | |
| Pagination | 無限スクロール (ListView.builder + ScrollController) | モバイルはページネーションより無限スクロールが自然 |
| Tabs | TabBar + TabBarView | |

### 映画関連コンポーネント

| Web版 | Flutter版 | 備考 |
|-------|-----------|------|
| MovieTile | MovieTile (GestureDetector + Card) | グリッド表示 |
| MovieTileSkeleton | MovieTileSkeleton (Shimmer) | |
| MovieDetailModal | MovieDetailModal (showModalBottomSheet) | フルスクリーンBottomSheet |
| FilterModal | FilterModal (showModalBottomSheet) | |
| SearchBar | SearchBar (TextField + IconButton) | AppBarに配置 |
| SearchResults | SearchResults (GridView.builder) | |
| WatchlistItem | WatchlistItem (ListTile or カスタム) | |

### レイアウトコンポーネント

| Web版 | Flutter版 | 備考 |
|-------|-----------|------|
| AppLayout (サイドバー + ヘッダー) | AppScaffold (Scaffold + BottomNav) | モバイル最適化 |
| Header | AppBar | |
| Sidebar | Drawer / BottomNavigationBar | |
| SideNav | BottomNavigationBar | メインナビゲーション |
| UserMenu | Drawer内 or 設定画面 | |
| SearchBar (Header内) | AppBar の actions / 検索画面 | |
| Footer | 不要（モバイルにはフッターなし） | |
| MobileDrawer | Drawer | |

### 認証コンポーネント

| Web版 | Flutter版 | 備考 |
|-------|-----------|------|
| LoginForm | LoginScreen | 画面として実装 |
| RegisterForm | RegisterScreen | 画面として実装 |
| OTPVerification | OtpVerificationScreen | 画面として実装 |
| SocialLoginButtons | ソーシャルログインボタン群（ウィジェット） | 共通化して再利用 |
| PasswordChangeForm | ChangePasswordScreen | 画面として実装 |

---

## レイアウトの変更点

### Web版

```
+---------------------+
|     Header/Nav      |
+------+--------------+
|      |              |
| Side |   Content    |
| bar  |    Area      |
|      |              |
+------+--------------+
```

### Flutter版

```
+---------------------+
|      AppBar         |
+---------------------+
|                     |
|     Content         |
|      Area           |
|                     |
+---------------------+
| BottomNavigationBar |
+---------------------+
```

### ナビゲーション構成

| BottomNav タブ | 画面 | Web版の対応 |
|---------------|------|------------|
| ホーム | 公開中 / 近日公開（タブ切替） | /movies/now-showing, /movies/upcoming |
| 検索 | 検索画面 | /search |
| ウォッチリスト | ウォッチリスト一覧 | /watchlist |
| お気に入り | お気に入り一覧 | /favorites |
| 設定 | 設定画面 | /settings |

---

## アニメーション方針

Web版と同じく最小限に抑える。

| 対象 | アニメーション |
|------|--------------|
| 画面遷移 | Flutter標準のページ遷移（MaterialPageRoute） |
| BottomSheet表示 | Flutter標準のスライドアップ |
| SnackBar | Flutter標準のフェードイン |
| リスト表示 | なし（パフォーマンス優先） |
| ボタンタップ | Flutter標準のInkWell ripple |

---

## アクセシビリティ

Web版と同じくWCAG AA準拠を目指す。

| 対象 | Flutter での対応 |
|------|----------------|
| スクリーンリーダー | Semantics ウィジェット |
| フォーカス表示 | FocusNode + カスタムスタイル |
| カラーコントラスト | Web版と同じカラーパレット使用 |
| タッチターゲット | 最低48x48dp（Material Design推奨） |
| テキストサイズ | MediaQuery.textScaleFactorに対応 |
