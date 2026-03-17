**ステータス: 完了**

## フェーズ4: ウォッチリスト機能（1週間）

### ユーザープロフィール表示
- [x] ユーザーアイコン・名前表示（NextAuth.jsセッション情報から取得）
- [x] アイコン押下時のポップオーバーメニュー実装
  - 設定リンク
  - ログアウトボタン
- [x] 設定画面の設計・実装
  - 表示名変更
  - 通知設定
  - テーマ切り替え

### ウォッチリスト機能

#### Step 1: DB確認・API・フック基盤（`feature/watchlist-api`）
- [x] watchlistテーブルの既存migration確認（RLS・インデックス・UNIQUE制約のWHERE deleted_at IS NULL対応）
- [x] ウォッチリスト一覧取得API（GET /api/watchlist）
  - NextAuth.jsで認証チェック
  - カーソルベースページング（無限スクロール用、20件ずつ）
  - ソート: 追加日順（新しい順）
- [x] ウォッチリスト追加API（POST /api/watchlist）
  - NextAuth.jsで認証チェック
  - 重複チェック（409 Conflict）
- [x] ウォッチリスト削除API（DELETE /api/watchlist/:id）
  - NextAuth.jsで認証チェック
  - 論理削除（deleted_at更新）
- [x] zodバリデーションスキーマ作成
- [x] APIクライアント（src/lib/api/watchlist.ts）作成
- [x] useWatchlistフック作成（TanStack Query）
  - useInfiniteQuery（サイドバー一覧用、20件ずつ）
  - useMutation（追加・削除、楽観的UI更新）
  - ウォッチリスト状態チェック（キャッシュから判定）
- [x] テストを追加
  - API Routeテスト（/api/watchlist）
    - GET: 認証チェック・ページング・ソート・deleted_atフィルタ
    - POST: 認証チェック・正常追加・重複409・バリデーションエラー
    - DELETE: 認証チェック・正常削除・404（存在しない/他ユーザー/削除済み）
  - zodスキーマテスト（watchlistAddSchema等）
  - APIクライアントテスト（getWatchlist・addWatchlist・removeWatchlist）
  - useWatchlistフックテスト
    - 一覧取得（useInfiniteQuery）・次ページ読み込み
    - 追加mutation・楽観的更新・エラー時ロールバック
    - 削除mutation・楽観的更新・エラー時ロールバック
    - ウォッチリスト状態チェック（isInWatchlist）

#### Step 2: サイドバーウォッチリスト表示（`feature/watchlist-sidebar`）
- [x] MovieDetailModalを共通UIコンポーネントに移動（features/movies/component/ → components/ui/movie/detailModal/）
  - 現在movieListContentからのみ使用されているが、WatchlistPanel・お気に入り等からも使うため共通化
  - 既存のimportパスを更新
- [x] WatchlistItemコンポーネント作成（小ポスター + タイトル + 削除ボタン、クリックで映画詳細モーダル表示）
- [x] WatchlistPanelコンポーネント作成（サイドバー内、高さ300px、スクロール + 無限読み込み + MovieDetailModal統合）
- [x] 既存Sidebarのwatchlist propにWatchlistPanelを渡して統合（スロット・見出しは実装済み）
- [x] 空状態の表示（「ウォッチリストに映画を追加しましょう」）
- [x] テストを追加
  - WatchlistItemテスト
    - レンダリング（ポスター・タイトル・削除ボタン表示）
    - アイテムクリック時にonClick（映画詳細モーダル表示用）コールバック
    - 削除ボタンクリック時のコールバック（onClickを発火しない、stopPropagation）
    - ポスター画像なし時のフォールバック表示
    - aria属性の確認
  - WatchlistPanelテスト
    - 一覧表示（複数件）
    - 空状態メッセージ表示
    - ローディング状態表示
    - スクロール時の追加読み込みトリガー（Intersection Observer）

#### Step 3: MovieTileウォッチリスト統合（`feature/watchlist-tile`）
- [x] WatchlistAddButtonコンポーネント作成（プラスアイコン / チェックアイコン切替）
- [x] MovieTileにWatchlistAddButton統合（ポスター上にオーバーレイ表示）
  - event.stopPropagation()で詳細モーダルと干渉しない
- [x] 映画詳細モーダル内にもウォッチリスト追加/削除ボタン配置
- [x] 楽観的UI更新（追加/削除時に即座にUI反映、失敗時にロールバック）
- [x] Toast通知（「ウォッチリストに追加しました」「ウォッチリストから削除しました」）
- [x] テストを追加
  - WatchlistAddButtonテスト
    - 未追加時: プラスアイコン表示・クリックで追加コールバック
    - 追加済み時: チェックアイコン表示・クリックで削除コールバック
    - event.stopPropagation()が呼ばれることの確認
    - aria-label切替（「ウォッチリストに追加」/「ウォッチリストから削除」）
  - MovieTile統合テスト
    - WatchlistAddButtonがポスター上に表示される
    - ボタンクリックがMovieTileのonClickを発火しない
  - 映画詳細モーダル統合テスト
    - ウォッチリスト追加/削除ボタンの表示・動作
  - E2Eテスト（Playwright）
    - MovieTileからウォッチリスト追加 → サイドバーに反映
    - サイドバーから削除 → MovieTileのアイコンが戻る
    - 詳細モーダルからウォッチリスト追加/削除
    - Toast通知の表示確認

#### Step 3.5: テスト戦略改善 — テスティングトロフィー導入（`setup/testing-trophy`）
- [x] テスト戦略ドキュメント作成（`.claude/documents/testing-strategy.md`）
  - テスティングトロフィーモデルの採用方針
  - 各テストレイヤーの役割・境界・判断基準
    - 静的解析（TypeScript + ESLint）: 型エラー・コード品質
    - 単体テスト（Jest）: 純粋なロジック・ユーティリティ・定数
    - 結合テスト（Jest + RTL）: コンポーネントの振る舞い・フック・API Route
    - E2E（Playwright）: クリティカルユーザーフローのみ
  - E2E設計思想（対象範囲・安定性ルール・データ依存テストの扱い・クリーンアップ方針）
  - テストの安定性ルール（フレーク対策・待機戦略・`waitForTimeout`禁止）
- [x] `e2e-test.md` 更新
  - テストスペック一覧に新規追加分（watchlistButton.spec.ts等）を反映
  - 共通ヘルパー管理ルールを追記（`e2e/helpers/`に集約）
  - `testing-strategy.md` へのリンク追加
- [x] E2E共通ヘルパーのリファクタリング
  - 重複ヘルパー関数（`movieTileButtons`等）を`e2e/helpers/`に集約
  - 各specファイルからのimportに統一
- [x] `/test` スキル更新
  - 参考ドキュメントに `testing-strategy.md` へのリンク追加
- [x] CLAUDE.md更新
  - 設計ドキュメント一覧に `testing-strategy.md` を追加

#### Step 3.6a: カバー済みE2Eテスト削除（`setup/test-layer-review-cleanup`）
- [x] `e2e/layout/footer.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/layout/header.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/navigation/sideNav.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/home/home.spec.ts` 削除（結合テストで完全カバー済み）
- [x] `e2e/layout/userMenu.spec.ts` 削除（結合テストでほぼカバー済み）
- [x] E2E関連ドキュメント更新（`e2e-test.md`）

#### Step 3.6b: 認証フォーム結合テスト移行（`setup/test-layer-auth-form`）
- [x] `signin.spec.ts` からバリデーション・エラー表示・リンク遷移テストを結合テストに移行
- [x] `signup.spec.ts` からバリデーション・リンク遷移テストを結合テストに移行
- [x] 移行済みテストケースをE2Eから削除（認証フロー系のみE2Eに残す）

#### Step 3.6c: 映画ページ結合テスト移行（`setup/test-layer-movies`）
- [x] `movieDetail.spec.ts` からモーダル表示・コンテンツ・開閉操作テストを結合テストに移行
- [x] `nowShowing.spec.ts` / `upcoming.spec.ts` からページUI表示テストを結合テストに移行
- [x] `sortFilter.spec.ts` からソート変更・フィルター適用テストを結合テストに移行
- [x] `watchlistButton.spec.ts` からボタン表示・aria属性・状態切替テストを結合テストに移行
- [x] 移行済みテストケースをE2Eから削除（無限スクロール・同期系のみE2Eに残す）

#### Step 3.6d: 設定ページ結合テスト移行（`setup/test-layer-settings`）
- [x] `settings.spec.ts` からバリデーション・テーマ切替・通知トグルテストを結合テストに移行
- [x] 移行済みテストケースをE2Eから削除（認証保護・テーマ切替のみE2Eに残す）

### お気に入り機能（設計書: `.claude/documents/favorites-design.md`）

> テスティングトロフィーモデル（Step 3.5）を最初から適用。各Stepでテストレイヤーを明示する。

#### Step 4: DB・API・スキーマ基盤（`feature/favorites-api`）
- [x] favoritesテーブル作成（Supabase migration）
  - UUID主キー、論理削除、RLSポリシー設定
  - UNIQUE制約（user_id, tmdb_movie_id WHERE deleted_at IS NULL）
  - update_updated_at_column() トリガー適用
- [x] zodバリデーションスキーマ作成（favoritesAddSchema, favoritesUpdateSchema, favoritesQuerySchema）
- [x] お気に入り定数追加（エラーメッセージ、成功メッセージ、queryKeys等）
- [x] 映画一覧API（GET /api/movies）にお気に入り情報を追加
  - 認証済みの場合、favoritesテーブルをLEFT JOINし各映画に `favorite: { id, rating } | null` を付与
  - 未認証の場合は `favorite` フィールドを含めない
- [x] 映画詳細API（GET /api/movies/:id）にお気に入り情報を追加
  - 認証済みの場合、`favorite: { id, rating } | null` を付与
- [x] お気に入り一覧取得API（GET /api/favorites）
  - NextAuth.jsで認証チェック
  - ページベースページング（page/limit、20件ずつ）
  - ソート: 登録日順（added_at） / 評価順（rating）
- [x] お気に入り追加API（POST /api/favorites）
  - NextAuth.jsで認証チェック
  - 重複チェック（409 Conflict）
- [x] 評価更新API（PATCH /api/favorites/:id）
  - NextAuth.jsで認証チェック
  - 所有者チェック（404 Not Found）
- [x] お気に入り削除API（DELETE /api/favorites/:id）
  - NextAuth.jsで認証チェック
  - 論理削除（deleted_at更新）
- [x] APIクライアント（src/lib/api/favorites/favorites.ts）作成
- [x] 単体テスト
  - zodスキーマテスト（favoritesAddSchema, favoritesUpdateSchema, favoritesQuerySchema）
  - APIクライアントテスト（getFavorites, addFavorite, updateFavoriteRating, removeFavorite）
- [x] 結合テスト
  - API Routeテスト（GET /api/movies）— お気に入り情報付与
    - 認証済み: 各映画に `favorite` フィールドが含まれる
    - 未認証: `favorite` フィールドが含まれない
    - お気に入り登録済み映画: `{ id, rating }` が返る
    - 未登録映画: `null` が返る
  - API Routeテスト（GET /api/movies/:id）— お気に入り情報付与
    - 認証済み/未認証の `favorite` フィールド確認
  - API Routeテスト（/api/favorites）
    - GET: 認証チェック・ページング・ソート・deleted_atフィルタ
    - POST: 認証チェック・正常追加・重複409・バリデーションエラー
  - API Routeテスト（/api/favorites/:id）
    - PATCH: 認証チェック・正常更新・バリデーションエラー・404（存在しない/他ユーザー/削除済み）
    - DELETE: 認証チェック・正常削除・404（存在しない/他ユーザー/削除済み）

#### Step 5: お気に入りUI + MovieTile統合（`feature/favorites-ui`）
- [x] useFavoritesフック作成（TanStack Query）
  - useQuery（一覧取得 — /favoritesページ用）
  - useMutation（追加・評価更新・削除）
  - 楽観的UI更新（映画一覧キャッシュ内の該当映画の `favorite` フィールドを更新）
- [x] useFavoriteToggleフック作成
  - useFavorites + useToast を統合
  - 未登録: RatingModal表示 → 登録
  - 登録済み: RatingModal表示（現在の評価セット）→ 更新 or 削除
- [x] RatingIndicatorコンポーネント作成（1〜10点、数値インジケーター）
  - インタラクティブモード（モーダル内）: クリックで評価選択
  - 表示モード（一覧画面）: 読み取り専用
- [x] FavoriteRatingModalコンポーネント作成（点数入力モーダル）
  - Radix UI Dialogベース
  - 映画タイトル表示 + RatingIndicator
  - 新規: 「登録」「キャンセル」ボタン
  - 更新: 現在の評価を初期値 + 「更新」「削除」「キャンセル」ボタン
- [x] FavoriteButtonコンポーネント作成（ハートアイコン）
  - props: `favorite: { id, rating } | null`（映画一覧レスポンスから渡される）
  - `favorite` が null: 白抜きハート → クリックでRatingModal表示
  - `favorite` がオブジェクト: 塗りつぶしハート（$secondary-600）→ クリックで評価変更モーダル表示
  - event.stopPropagation()でMovieTileクリックと干渉しない
- [x] MovieTileにFavoriteButton統合（ポスター上にオーバーレイ表示）
- [x] 映画詳細モーダル内にもFavoriteButton配置
- [x] Toast通知（「お気に入りに追加しました」「お気に入りから削除しました」「評価を更新しました」）
- [x] 結合テスト
  - useFavoritesフックテスト
    - 一覧取得（useQuery）・ページ切替
    - 追加mutation・映画一覧キャッシュの楽観的更新・エラー時ロールバック
    - 評価更新mutation・映画一覧キャッシュの楽観的更新
    - 削除mutation・映画一覧キャッシュの楽観的更新・エラー時ロールバック
  - useFavoriteToggleフックテスト
    - 未登録映画: モーダル表示フラグON
    - 登録済み映画: モーダル表示フラグON（現在の評価付き）
  - RatingIndicatorテスト
    - インタラクティブモード: クリックで値変更・コールバック発火
    - 表示モード: 読み取り専用で表示・クリック無効
    - aria属性の確認
  - FavoriteRatingModalテスト
    - 新規登録: タイトル表示・評価選択・登録ボタンで送信
    - 評価変更: 現在の評価が初期値・更新ボタンで送信
    - 削除: 削除ボタンで削除コールバック発火
    - キャンセル・ESCで閉じる
  - FavoriteButtonテスト
    - 未登録時: 白抜きハート表示・クリックでコールバック
    - 登録済み時: 塗りつぶしハート表示・クリックでコールバック
    - event.stopPropagation()の確認
    - aria-label切替（「お気に入りに追加」/「お気に入りを編集」）
  - MovieTile統合テスト
    - FavoriteButtonがポスター上に表示される
    - ボタンクリックがMovieTileのonClickを発火しない
  - 映画詳細モーダル統合テスト
    - FavoriteButton表示・動作確認

#### Step 6: お気に入り一覧ページ（`feature/favorites-page`）
- [x] ROUTES定数にFAVORITES追加
- [x] SideNavに「お気に入り」項目追加
- [x] /favorites ページ作成（メタデータ設定）
- [x] FavoriteListコンポーネント作成
  - MovieTileと同様のグリッドレイアウト
  - 各タイルにRatingIndicator（表示モード）を表示
  - 空状態の表示（「お気に入りの映画を追加しましょう」）
- [x] ソートSelect（登録日順 / 評価順）
- [x] useFavoritesPageフック作成（ソート状態管理 + useFavorites統合）
- [x] 結合テスト
  - FavoriteListテスト
    - 一覧表示（複数件・グリッド）
    - 空状態メッセージ表示
    - ローディング状態表示
    - 各タイルにRatingIndicator表示
  - favoritesPageテスト
    - ソート切替（登録日順 ↔ 評価順）
    - FavoriteButtonクリック → RatingModal表示
- [x] E2Eテスト（Playwright）— クリティカルユーザーフローのみ
  - MovieTileからお気に入り追加（評価選択 → 登録）→ ハートアイコン変化
  - お気に入り一覧ページで表示確認 → 評価変更 → 削除
  - 詳細モーダルからお気に入り追加/削除
