# iOS 配布方法（ストア申請なし・個人利用）

## 概要

App Storeに申請せず、個人のiPhoneにのみインストールして使用する。
Apple Developer Program（年99ドル）には登録しない前提で、無料Apple IDを使用する。

---

## 選定方法: Sideloadly + 自動リフレッシュ

### 選定理由

| 方法 | 安定性 | 費用 | 自動化 | 選定 |
|------|--------|------|--------|------|
| Xcode 直接ビルド | 高 | 無料 | 手動（週1回） | 開発中はこれ |
| Sideloadly 自動リフレッシュ | 高 | 無料 | Mac起動中に自動 | 完成後はこれ |
| SideStore | 不安定 | 無料 | iPhone単体 | 非推奨 |
| Apple Developer Program | 最高 | 年99ドル | 不要 | 予算があれば |

**SideStoreを非推奨とする理由**:
- iOSアップデートのたびにAppleに潰される（意図的な破壊）
- ペアリングファイルが突然壊れる（原因不明）
- ナイトリービルド（実験版）に依存することが多い
- 2026年3月時点でiOS 26.4での不具合が多数報告

---

## 制約事項（無料Apple ID）

| 制約 | 内容 |
|------|------|
| 署名有効期間 | **7日間** |
| 同時インストール数 | **3アプリまで** |
| App ID作成制限 | 7日間で10個まで |
| 配布範囲 | 自分の端末のみ |

---

## 開発中の運用（Xcode直接ビルド）

### 手順

```bash
# Flutter プロジェクトを実機で実行
cd mobile
flutter run -d <device_id>
```

これだけでビルド + インストール + 起動が行われる。
開発中は毎日ビルドするため、7日制限は実質問題にならない。

### 初回セットアップ

1. **ケーブル接続**（初回1回のみ）
   - iPhoneをUSBケーブルでMacに接続
   - 「このコンピュータを信頼しますか？」→「信頼」

2. **Xcode 署名設定**
   - `mobile/ios/Runner.xcworkspace` を Xcode で開く
   - Runner > Signing & Capabilities
   - Team: Personal Team を選択
   - Bundle Identifier: `com.fukumi.movieApp`

3. **Developer Mode 有効化**（iOS 16以降）
   - iPhone: 設定 → プライバシーとセキュリティ → デベロッパモード → ON

4. **Wi-Fi ペアリング**（ケーブル接続中に実施）
   - Xcode: Window → Devices and Simulators
   - iPhoneを選択 → 「Connect via network」にチェック
   - 以降はケーブル不要

---

## 完成後の運用（Sideloadly自動リフレッシュ）

### Sideloadly とは

正規のApple署名プロセスを使ってIPAファイルをiPhoneにインストールするツール。
Appleに潰されるリスクがない（正規の仕組みを使うため）。

**セキュリティに関する注意**: SideloadlyはApple IDとパスワード（またはApp-Specific Password）を使用して署名を行う。信頼できるツールだが、Apple IDの認証情報を第三者ツールに渡すことになるため、以下を推奨：
- Apple IDのApp-Specific Passwordを使用する（メインパスワードは渡さない）
- 可能であればSideloadly専用のApple IDを作成する

### インストール

1. https://sideloadly.io/ からMac版をダウンロード
2. インストールして起動

### 初回セットアップ

1. **IPAファイルの作成**
   ```bash
   cd mobile
   flutter build ios --release
   ```
   Xcode で Archive → Export（Development配布）→ IPAファイル生成

2. **Sideloadlyで初回インストール**
   - Sideloadlyを起動
   - IPAファイルをドラッグ&ドロップ
   - Apple IDでサインイン
   - 「Start」をクリック
   - iPhoneにインストールされる

3. **自動リフレッシュを有効化**
   - インストール時に「Enable automatic refreshing」にチェック
   - Sideloadly Daemon がバックグラウンドで動作
   - 署名期限が近づくとWi-Fi経由で自動更新

### 自動リフレッシュの条件

- **MacとiPhoneが同じWi-Fiに接続されている**
- **Macが起動している**（スリープ中はダメ）
- **Sideloadly Daemon が動作している**

### 運用パターン

平日の日中にMacを仕事で使っている場合：
- Mac起動中にSideloadlyが自動的に署名を更新
- 7日以内に1回でもMacが起きていればOK
- 特に意識する必要なし

### トラブル時の対処

| 症状 | 対処 |
|------|------|
| アプリが起動しない | 署名切れ。Macを起動してSideloadlyで再インストール |
| Sideloadlyがデバイスを認識しない | Wi-Fiペアリングを再設定 |
| Apple IDエラー | Sideloadlyで再ログイン |

---

## 将来的にApple Developer Program（年99ドル）に移行する場合

移行は簡単：

1. https://developer.apple.com/programs/ で登録
2. Xcode の Team を Personal Team → 有料アカウントに変更
3. 再ビルド → 署名が1年間有効に
4. Sideloadly の自動リフレッシュは不要になる

---

## 退職時の対応

会社のMacでWi-Fiペアリングを設定している場合：

1. Xcode: Window → Devices and Simulators → 「Connect via network」のチェックを外す
2. iPhone側: 設定 → 一般 → VPNとデバイス管理 → 会社Mac関連の信頼を解除
3. 自宅Mac（用意できた場合）で改めてケーブル接続 → Wi-Fiペアリング再設定
