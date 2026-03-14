# Flutter iOS アプリ - アーキテクチャ設計

## 概要

映画ウォッチリスト管理アプリのiOS版。
Web版（Next.js）と同じバックエンド（Supabase + TMDb API）を共有し、FlutterでネイティブiOSアプリとして構築する。

---

## 技術スタック

### フロントエンド
- **Framework**: Flutter (最新安定版)
- **言語**: Dart
- **状態管理**: Riverpod
- **HTTP Client**: dio（TMDb API用）
- **フォームバリデーション**: flutter_form_builder または手動バリデーション
- **アイコン**: Material Icons / Cupertino Icons

### バックエンド（Web版と共有）
- **データベース**: Supabase (PostgreSQL)
- **認証**: supabase_flutter（Supabase Auth）
- **メール送信**: Resend（既存のNext.js API Routes経由）
- **外部API**: TMDb API

### 認証方式の変更点
Web版はNextAuth.jsを使用しているが、Flutter版では**supabase_flutterの認証機能**を直接使用する。

| 機能 | Web版 | Flutter版 |
|------|-------|-----------|
| メール+パスワード | NextAuth.js | supabase_flutter Auth |
| OTPログイン | NextAuth.js + カスタム | supabase_flutter Auth OTP |
| Google OAuth | NextAuth.js | supabase_flutter Auth + google_sign_in |
| GitHub OAuth | NextAuth.js | supabase_flutter Auth + OAuth |
| セッション管理 | JWT (24h) | supabase_flutter セッション |

**注意**: NextAuth.jsのAPI Routes（`/api/auth/*`）はWeb専用。Flutter版はSupabase Authに直接接続する。ただし、OTP送信（Resend経由）など一部のAPI Routesは共有する可能性がある。

---

## ディレクトリ構成

```
mobile/
├── android/              # Android設定（未使用だが自動生成）
├── ios/                  # iOS設定（Xcode プロジェクト）
├── lib/
│   ├── main.dart         # エントリーポイント
│   ├── app.dart          # MaterialApp設定
│   ├── config/           # 設定・定数
│   │   ├── constants.dart
│   │   ├── theme.dart    # テーマ設定（Web版デザインシステム準拠）
│   │   └── routes.dart   # ルーティング定義
│   ├── models/           # データモデル（freezed）
│   │   ├── movie.dart
│   │   ├── user.dart
│   │   ├── watchlist_item.dart
│   │   └── api_response.dart
│   ├── providers/        # Riverpodプロバイダー
│   │   ├── auth_provider.dart
│   │   ├── movie_provider.dart
│   │   ├── watchlist_provider.dart
│   │   ├── theme_provider.dart
│   │   └── toast_provider.dart
│   ├── repositories/     # データアクセス層
│   │   ├── auth_repository.dart
│   │   ├── movie_repository.dart
│   │   └── watchlist_repository.dart
│   ├── services/         # 外部サービス連携
│   │   ├── supabase_service.dart
│   │   ├── tmdb_service.dart
│   │   └── dio_client.dart
│   ├── screens/          # 画面（ページ）
│   │   ├── auth/
│   │   │   ├── login_screen.dart
│   │   │   ├── register_screen.dart
│   │   │   └── otp_verification_screen.dart
│   │   ├── home/
│   │   │   └── home_screen.dart
│   │   ├── movies/
│   │   │   ├── now_showing_screen.dart
│   │   │   └── upcoming_screen.dart
│   │   ├── search/
│   │   │   └── search_screen.dart
│   │   ├── watchlist/
│   │   │   └── watchlist_screen.dart
│   │   ├── favorites/
│   │   │   └── favorites_screen.dart
│   │   └── settings/
│   │       ├── settings_screen.dart
│   │       └── change_password_screen.dart
│   ├── widgets/          # 再利用可能なウィジェット
│   │   ├── common/       # 汎用ウィジェット
│   │   │   ├── app_button.dart
│   │   │   ├── app_input.dart
│   │   │   ├── app_card.dart
│   │   │   ├── app_modal.dart
│   │   │   ├── app_toast.dart
│   │   │   ├── app_loading.dart
│   │   │   ├── app_avatar.dart
│   │   │   ├── app_select.dart
│   │   │   └── empty_state.dart
│   │   ├── movie/        # 映画関連ウィジェット
│   │   │   ├── movie_tile.dart
│   │   │   ├── movie_tile_skeleton.dart
│   │   │   ├── movie_detail_modal.dart
│   │   │   └── filter_modal.dart
│   │   └── layout/       # レイアウトウィジェット
│   │       ├── app_scaffold.dart
│   │       ├── app_bottom_nav.dart
│   │       └── app_drawer.dart
│   └── utils/            # ユーティリティ
│       ├── date_utils.dart
│       ├── image_utils.dart
│       ├── string_utils.dart
│       └── validation_utils.dart
├── test/                 # テスト
│   ├── models/
│   ├── providers/
│   ├── repositories/
│   ├── services/
│   ├── screens/
│   ├── widgets/
│   └── utils/
├── pubspec.yaml          # パッケージ定義
├── analysis_options.yaml # Lint設定
└── .env.example          # 環境変数テンプレート
```

---

## 設計原則

### レイヤード・アーキテクチャ

```
Screen（UI）
  ↓ Riverpod Provider経由でデータ取得
Provider（状態管理）
  ↓ Repositoryに処理を委譲
Repository（データアクセス）
  ↓ Serviceを使って外部接続
Service（外部通信）
  ↓
Supabase / TMDb API
```

| レイヤー | 責務 | Web版との対応 |
|---------|------|-------------|
| Screen | UI描画のみ | React Component |
| Provider | 状態管理・ビジネスロジック | Custom Hook + Zustand |
| Repository | データ取得・加工 | API Route呼び出し部分 |
| Service | 外部API/DB通信 | lib/tmdb, lib/supabase |
| Model | データ構造定義 | types/ |

### 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| ファイル名 | snake_case | `movie_tile.dart` |
| クラス名 | PascalCase | `MovieTile` |
| 変数・関数 | lowerCamelCase | `handleClick`, `isLoading` |
| 定数 | lowerCamelCase | `primaryColor` |
| プロバイダー | lowerCamelCase + Provider | `movieListProvider` |

---

## 主要パッケージ（予定）

| パッケージ | 用途 | Web版との対応 |
|-----------|------|-------------|
| `flutter_riverpod` | 状態管理 | Zustand |
| `supabase_flutter` | Supabase接続・認証 | Supabase SDK (JS) + NextAuth.js |
| `dio` | HTTP通信（TMDb API） | axios |
| `go_router` | ルーティング | Next.js App Router |
| `freezed` / `json_serializable` | モデル生成 | TypeScript型定義 |
| `cached_network_image` | 画像キャッシュ | Next.js Image |
| `flutter_secure_storage` | セキュアストレージ | Cookie / localStorage |
| `google_sign_in` | Google OAuth | NextAuth.js Google Provider |
| `flutter_dotenv` | 環境変数 | .env.local |
| `shimmer` | スケルトンUI | カスタムCSS |
| `intl` | 日付フォーマット | date-fns相当 |

---

## データフロー

### 映画一覧取得

```
HomeScreen
  ↓ ref.watch(movieListProvider)
movieListProvider (Riverpod)
  ↓
MovieRepository.getMovies(page)
  ↓
TMDbService.discoverMovies(page)  ← dio経由でTMDb API直接呼び出し
  ↓
Movie モデルに変換
  ↓
UIに反映
```

**Web版との違い**: Web版はNext.js API Routes経由でDBキャッシュを使用しているが、Flutter版はTMDb APIを直接呼び出す。DBキャッシュが必要な場合はSupabaseの既存テーブルを参照する。

### 認証フロー

```
LoginScreen
  ↓
authProvider (Riverpod)
  ↓
AuthRepository.signIn(email, password)
  ↓
SupabaseService.auth.signInWithPassword(...)
  ↓
セッション保持（supabase_flutter が自動管理）
  ↓
HomeScreenへ遷移
```

### ウォッチリスト操作

```
MovieTile「見たい」ボタン
  ↓
watchlistProvider (Riverpod)
  ↓
WatchlistRepository.add(movieId)
  ↓
SupabaseService.from('watchlist').insert(...)
  ↓
状態更新 → UI反映
```

---

## Web版との主な違い

| 観点 | Web版 (Next.js) | Flutter版 |
|------|----------------|-----------|
| レンダリング | SSR/CSR | クライアントのみ |
| ルーティング | ファイルベース | go_router（宣言的） |
| 認証 | NextAuth.js (JWT) | supabase_flutter Auth |
| API呼び出し | API Routes経由 | TMDb API / Supabase直接 |
| スタイリング | SCSS Modules | Flutter ThemeData |
| レイアウト | サイドバー + ヘッダー | BottomNavigationBar + Drawer |
| 画像最適化 | Next.js Image | cached_network_image |
| 状態管理 | Zustand + Custom Hooks | Riverpod |

---

## 環境変数（Flutter版）

```
# TMDb API
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_BASE_URL=https://api.themoviedb.org/3
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

**注意**: Web版と同じSupabaseプロジェクト・TMDb APIキーを使用する。NextAuth.js関連の環境変数はFlutter版では不要。
