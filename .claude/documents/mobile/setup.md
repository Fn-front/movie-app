# Flutter iOS アプリ - 環境構築手順

## 前提条件

- macOS（FlutterのiOSビルドにはMacが必須）
- Xcode（インストール済み）
- Apple ID（無料アカウントでOK）

---

## 1. Flutter SDK インストール

### Homebrew 経由（推奨）

```bash
brew install --cask flutter
```

### 手動インストール

```bash
# Flutter SDKをダウンロード
# https://docs.flutter.dev/get-started/install/macos

# PATHに追加（.zshrcに記載）
export PATH="$HOME/development/flutter/bin:$PATH"
```

### インストール確認

```bash
flutter --version
flutter doctor
```

---

## 2. Flutter Doctor で環境チェック

```bash
flutter doctor -v
```

以下が全てチェック済みであることを確認：

| 項目 | 必要なアクション |
|------|----------------|
| Flutter | SDK インストール済み |
| iOS toolchain | Xcode インストール済み |
| Xcode | Command Line Tools 設定済み |
| CocoaPods | インストール必要（下記参照） |

### CocoaPods インストール

```bash
# Homebrew経由（推奨）
brew install cocoapods

# または gem 経由
sudo gem install cocoapods
```

---

## 3. Xcode 設定

### Command Line Tools 確認

```bash
xcode-select --install
```

### ライセンス同意

```bash
sudo xcodebuild -license accept
```

### iOS Simulator 確認

```bash
open -a Simulator
```

---

## 4. Flutter プロジェクト作成

モノレポ構成に合わせて `mobile/` ディレクトリに作成する。

```bash
# リポジトリルートから実行
cd /path/to/movie-app

# Flutterプロジェクト作成（mobile/ディレクトリに）
flutter create --org com.fukumi --project-name movie_app mobile
```

### プロジェクト作成後の確認

```bash
cd mobile
flutter run
```

シミュレーターでデフォルトアプリが起動すればOK。

---

## 5. 主要パッケージのインストール

`mobile/pubspec.yaml` に以下を追加：

```yaml
dependencies:
  flutter:
    sdk: flutter

  # 状態管理
  flutter_riverpod: ^2.x.x
  riverpod_annotation: ^2.x.x

  # Supabase（認証 + DB）
  supabase_flutter: ^2.x.x

  # HTTP通信
  dio: ^5.x.x

  # ルーティング
  go_router: ^14.x.x

  # モデル生成
  freezed_annotation: ^2.x.x
  json_annotation: ^4.x.x

  # 画像
  cached_network_image: ^3.x.x

  # セキュアストレージ
  flutter_secure_storage: ^9.x.x

  # Google OAuth
  google_sign_in: ^6.x.x

  # 環境変数
  flutter_dotenv: ^5.x.x

  # スケルトンUI
  shimmer: ^3.x.x

  # 日付
  intl: ^0.x.x

dev_dependencies:
  flutter_test:
    sdk: flutter

  # コード生成
  build_runner: ^2.x.x
  freezed: ^2.x.x
  json_serializable: ^6.x.x
  riverpod_generator: ^2.x.x

  # テスト
  mockito: ^5.x.x
  mocktail: ^1.x.x

  # Lint
  flutter_lints: ^5.x.x
```

```bash
cd mobile
flutter pub get
```

**注意**: バージョン番号は `flutter pub add <package>` で最新版を取得するのが確実。上記の `x.x` は実行時点の最新に置き換える。

---

## 6. 環境変数の設定

### `.env` ファイル作成

```bash
# mobile/.env
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_BASE_URL=https://api.themoviedb.org/3
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

### `.gitignore` に追加

```
# mobile/.gitignore に追加
.env
```

### flutter_dotenv の設定

`pubspec.yaml` に assets 追加：

```yaml
flutter:
  assets:
    - .env
```

---

## 7. iOS 実機セットアップ（無料Apple ID）

### 初回セットアップ（ケーブル必要）

1. iPhoneをUSBケーブルでMacに接続
2. iPhone側で「このコンピュータを信頼しますか？」→「信頼」
3. Xcodeで `mobile/ios/Runner.xcworkspace` を開く
4. Signing & Capabilities で：
   - Team: 自分の Personal Team を選択
   - Bundle Identifier: `com.fukumi.movieApp`（ユニークな値に変更）
5. 実機を選択して Run

### Wi-Fi ペアリング設定（初回ケーブル接続中に実施）

1. Xcode メニュー → Window → Devices and Simulators
2. 接続中のiPhoneを選択
3. 「Connect via network」にチェック
4. チェックが入ったらケーブルを外してOK
5. 以降は `flutter run` でWi-Fi経由ビルド可能

### 実機で実行

```bash
# デバイスIDを確認
flutter devices

# 実機で実行
flutter run -d <device_id>
```

### 7日間の署名期限について

- 無料Apple IDでは署名が**7日で期限切れ**
- 期限が切れるとアプリが起動できなくなる（データは消えない）
- 再度 `flutter run` でビルドすれば署名が更新される
- Sideloadlyの自動リフレッシュで自動化可能（詳細は `distribution.md` 参照）

---

## 8. Lint 設定

`mobile/analysis_options.yaml`:

```yaml
include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: true
    prefer_const_literals_to_create_immutables: true
    avoid_print: true
    prefer_single_quotes: true
    sort_constructors_first: true
    unnecessary_this: true
```

---

## 9. フォルダ構造の初期作成

```bash
cd mobile/lib

mkdir -p config
mkdir -p models
mkdir -p providers
mkdir -p repositories
mkdir -p services
mkdir -p screens/auth
mkdir -p screens/home
mkdir -p screens/movies
mkdir -p screens/search
mkdir -p screens/watchlist
mkdir -p screens/favorites
mkdir -p screens/settings
mkdir -p widgets/common
mkdir -p widgets/movie
mkdir -p widgets/layout
mkdir -p utils
```

---

## トラブルシューティング

### CocoaPods エラー

```bash
cd mobile/ios
pod install --repo-update
```

### Xcode ビルドエラー

```bash
cd mobile
flutter clean
flutter pub get
cd ios && pod install && cd ..
flutter run
```

### 「Untrusted Developer」エラー（実機）

iPhone側: 設定 → 一般 → VPNとデバイス管理 → デベロッパAPP → 信頼

### Developer Mode 有効化（iOS 16以降）

iPhone側: 設定 → プライバシーとセキュリティ → デベロッパモード → ON
