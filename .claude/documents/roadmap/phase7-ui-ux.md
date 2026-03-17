**ステータス: 完了**

## フェーズ7: UI/UX改善

> テスティングトロフィーモデル（フェーズ4 Step 3.5）を適用。各Stepでテストレイヤーを明示する。

### Step 1: ウォッチリストページ + サイドバー仕様変更（`feature/watchlist-page`）

#### ウォッチリストAPI拡張
- [x] GET /api/watchlist にソートパラメータ追加
  - `sort`: `added_at`（デフォルト・既存動作） / `release_date_proximity`（公開日が今日に近い順、過去含む）
  - `limit`: 既存パラメータを活用（サイドバー用に10件指定）
  - zodバリデーションスキーマ更新
  - `release_date_proximity` ソート: `ABS(release_date - NOW())` の昇順、release_date が NULL の映画は末尾
- [x] APIクライアント（src/lib/api/watchlist.ts）にソートオプション追加

#### ウォッチリストページ（/watchlist）
- [x] ROUTES定数に `WATCHLIST: '/watchlist'` 追加
- [x] SideNavに「ウォッチリスト」項目追加
- [x] /watchlist ページ作成（メタデータ設定）
- [x] WatchlistListコンポーネント作成
  - MovieTileと同様のグリッドレイアウト
  - 無限スクロール（20件ずつ）
  - 空状態の表示（「ウォッチリストに映画を追加しましょう」）
  - MovieDetailModal統合（タイルクリックで表示）
- [x] ソートSelect（追加日順 / 公開日順）
- [x] useWatchlistPageフック作成（ソート状態管理 + useWatchlist統合）

#### サイドバーウォッチリスト仕様変更
- [x] WatchlistPanelを「公開日が近い順10件」表示に変更
  - 既存の無限スクロールを廃止
  - `sort=release_date_proximity&limit=10` でAPI呼び出し
  - 「すべて見る」リンク → `/watchlist` へ遷移
- [ ] サイドバーのウォッチリスト見出しを「公開日が近い映画」等に変更 → #163

#### テスト
- [x] 単体テスト
  - zodスキーマテスト（sortパラメータ追加分）
  - APIクライアントテスト（ソートオプション）
- [x] 結合テスト
  - WatchlistListコンポーネントテスト（一覧表示・空状態・無限スクロール）
  - WatchlistPanelテスト（10件表示・「すべて見る」リンク）
  - useWatchlistPageフックテスト
  - WatchlistPageテスト
- [x] E2Eテスト（Playwright）
  - ウォッチリストページ表示 → 映画詳細モーダル → 削除
  - サイドバー「すべて見る」→ ウォッチリストページ遷移

### Step 2: モバイルレイアウト基盤（`feature/mobile-layout`）

#### ハンバーガーメニュー
- [x] MobileMenuButtonコンポーネント作成（ハンバーガーアイコン、Header内に配置）
  - lg以上で非表示、lg未満で表示
- [x] MobileDrawerコンポーネント作成（Radix UI Dialog ベース）
  - ナビリンク（SideNavと同じ項目: ホーム / 公開予定 / 公開中 / お気に入り / ウォッチリスト）
  - ユーザーメニュー（アバター + 設定リンク + ログアウト）
  - カレンダーボタンは含めない（別途検討）
  - オーバーレイクリック / ESCで閉じる
  - ページ遷移時に自動で閉じる

#### レイアウト調整
- [x] Header: SP対応
  - ハンバーガーボタン追加（lg未満で表示）
  - SearchBar: SP対応（検索アイコンタップで展開）
  - ユーザーメニュー: lg未満で非表示（MobileDrawer内に移動）
- [x] Sidebar: lg未満で非表示（display: none）
- [x] Footer: SP簡略化（TMDbアトリビューションをコンパクトに1行表示）

#### テスト
- [x] 結合テスト
  - MobileDrawerテスト（開閉・ナビリンク・ユーザーメニュー・ページ遷移で閉じる）
  - MobileMenuButtonテスト（クリックでDrawer開閉）
  - Header SPレイアウトテスト（ハンバーガー表示、ユーザーメニュー非表示）
- [x] E2Eテスト（Playwright）
  - SP表示幅でハンバーガーメニュー → ナビゲーション遷移

### Step 3: 主要ページレスポンシブ対応（`feature/responsive-pages`）

> 画面を見ながら調整する。以下は対応対象の一覧であり、詳細はStep実装時に決定する。

#### MovieTileグリッド（全映画一覧ページ共通）
- [x] カラム数調整（SP: 2列 / タブレット: 3列 / PC: 4-5列）
- [x] MovieTileのフォントサイズ・余白調整

#### 各ページ個別対応
- [x] ホームページ（/）レスポンシブ
- [x] 公開予定（/movies/upcoming）レスポンシブ
- [x] 公開中（/movies/now-showing）レスポンシブ
- [x] お気に入り（/favorites）レスポンシブ
- [x] ウォッチリスト（/watchlist）レスポンシブ
- [x] 検索ページ（/search）レスポンシブ
  - MovieFilter: SP時はトグルボタンで表示/非表示切替
- [x] 設定ページ（/settings）レスポンシブ

#### モーダル・ダイアログ
- [x] MovieDetailModal: SP時のレイアウト調整（幅95vw + パディング縮小）
- [x] CalendarDialog: SP非提供（サイドバー非表示によりアクセス不可）
- [x] FavoriteRatingModal: SP時の調整（モーダル共通SP対応で対応）
- [x] FilterModal: SP時の調整（モーダル共通SP対応で対応）

#### カレンダーのSPアクセス導線
- [x] SPではカレンダー機能を非提供とする（SPでは見にくいため）

#### テスト
- [x] 結合テスト
  - 検索ページフィルタートグルテスト追加
- [x] E2Eテスト（Playwright）
  - SP表示幅での主要ページ表示確認
  - SP表示幅での映画詳細モーダル表示

### Step 4: スタイリング改善（`feature/styling-improvements`）

#### ホバーエフェクト
- [x] MovieTile: ホバー時のシャドウ変化（既存hover-shadow mixin適用）
- [x] ナビリンク: ホバー時の背景色変化
- [x] ボタン類: ホバー時のopacity変化（既存hover-opacity mixin適用）

#### フォーカス状態
- [x] focus-visible mixinの適用漏れがないか全コンポーネント確認
- [x] カスタムコンポーネント（Radix UI外）のフォーカス表示追加

#### トランジション
- [x] opacity / transform / box-shadow のトランジション統一（デザインシステム変数使用）

#### カラーコントラスト
- [x] WCAG AA基準（テキスト 4.5:1、UI要素 3:1）の全画面確認
- [x] 不足箇所の修正

#### テスト
- [x] 結合テスト
  - アクセシビリティテスト（カスタムコンポーネントのaria属性・フォーカス）
