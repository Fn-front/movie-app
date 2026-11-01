# ウォッチリスト: 追加年を指定した視聴済みの一括削除

- 日付: 2026-11-01
- 状態: 設計確定

## 概要

ウォッチリストに溜まった視聴済みの作品を、**追加した年を指定してまとめて削除**できるようにする。
削除前に確認モーダルで対象作品の一覧を提示し、残したい作品だけチェックを外せる。

現状の削除は `DELETE /api/watchlist/:id` の1件ずつしか無く、
数年分の視聴済みを片付けるのに作品数と同じ回数の操作が要る。

## スコープ

### 含む

- `watchlist.added_at` / `deleted_at` の `TIMESTAMPTZ` 移行（本機能の前提。下記「前提」を参照）
- 追加年ごとの視聴済み件数を返す集計 RPC
- 対象一覧の取得 API（ページング）
- 一括論理削除 API
- ウォッチリストページのツールバーから開く確認モーダル

### 含まない

- 配信開始された未視聴作品の優先表示（別の設計として切り出す）
- 視聴日（`watched_at`）を軸にした絞り込み。軸は**追加日（`added_at`）のみ**
- 削除の取り消し（UNDO）。既存の1件削除にも無く、ここだけ持たせる理由が無い
- 一覧ページ本体を年で絞り込む機能

## 前提

| 項目     | 現状                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| 削除     | 論理削除。`watchlist.deleted_at` に日時を入れる                                          |
| 視聴済み | `watchlist.watched_at`（`TIMESTAMPTZ`）。`NULL` は未視聴                                 |
| 追加日   | `watchlist.added_at`。**現状は `TIMESTAMP`（タイムゾーンなし）**。下記の通り移行する     |
| 一覧取得 | `get_watchlist_sorted` RPC 経由（`src/app/api/watchlist/route.ts`）                      |
| 件数上限 | 一覧は 50件/ページ（`WATCHLIST_MAX_LIMIT`）                                              |
| 再追加   | 追加の UNIQUE 制約は `deleted_at IS NULL` 条件付きのため、削除後に同じ映画を再追加できる |

### 前提として `added_at` を `TIMESTAMPTZ` に移行する

`watchlist.added_at` と `deleted_at` は今も `TIMESTAMP`（タイムゾーンなし）。
`20260319000000_index_and_schema_optimization.sql` で `TIMESTAMPTZ` へ統一したとき、
`favorites` / `saved_filters` / `dismissed_movies` / `users` は移行されたが **`watchlist` は漏れていた**。
`watched_at` だけが後から `TIMESTAMPTZ` で追加されており、同じテーブル内で型が食い違っている。

この型のままでは本機能の JST 処理が2箇所とも壊れる。

| 箇所 | 書きたい形                                      | `TIMESTAMP` での実際の挙動                                                        |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| RPC  | `added_at AT TIME ZONE 'Asia/Tokyo'`            | **逆変換**になる（壁時計時刻を JST とみなして `timestamptz` を返す）。9時間ズレる |
| API  | `.gte('added_at', '2024-01-01T00:00:00+09:00')` | `timestamp` 列との比較でオフセットが捨てられ、JST 補正が効かない                  |

そこで本実装の最初に、`favorites` と同じ手順で型を揃える
（`deleted_at` を参照する RLS ポリシーと部分インデックスを DROP → `ALTER COLUMN TYPE` → 再作成）。
既存値は `DEFAULT now()`（DB の UTC）とアプリの `toISOString()`（UTC）で書かれているため、
`USING added_at AT TIME ZONE 'UTC'` で解釈するのが正しい。

副次的に、`get_watchlist_sorted` が `RETURNS TABLE (added_at TIMESTAMPTZ)` と宣言しながら
実列は `TIMESTAMP` という暗黙キャスト（DB のタイムゾーン設定に依存）も解消される。

### 年の境界は JST で切る

型を揃えたうえで、年の定義は `Asia/Tokyo` 固定とし、**判定は常にバックエンドで行う**。
UTC のまま切ると `2025-01-01 05:00 JST` に追加した作品が 2024年扱いになり、
画面に表示されている日付とズレる。

フロントのローカルタイムゾーンで切ると、セレクトの選択肢と実際に削除される範囲がズレる余地が生まれる。

## データ層

### 新規 RPC: `get_watchlist_watched_years`

```sql
get_watchlist_watched_years(p_user_id UUID) RETURNS TABLE (year INT, count BIGINT)
```

- `added_at` を `AT TIME ZONE 'Asia/Tokyo'` に変換した年ごとに、
  `deleted_at IS NULL AND watched_at IS NOT NULL` の件数を集計する
- 件数 0 の年は返さない
- 年の降順
- `SECURITY INVOKER` / `SET search_path = public, pg_temp`
- `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`
  （既存の `get_watchlist_sorted` と同じ扱い）

集計（`GROUP BY`）は PostgREST で表現できないため、ここだけ RPC が要る。
対象一覧の取得と削除は単純な絞り込みなので PostgREST 直クエリで足りる。

マイグレーション適用後、`supabase gen types typescript` で型を再生成する。

## API

いずれも `withAuth` を通し、レスポンスは既存の統一形式に合わせる。

### 注意: RLS は防御にならない

`withAuth` は `createServiceRoleClient()` を使う（`src/helpers/routeHandler.ts`）。
**service_role は RLS をバイパスする**ため、他ユーザーの行を守るのは
クエリに付ける `user_id` 条件だけである。

本機能は一度に多数の行を更新するため、この条件の欠落は被害が大きい。
`bulk-delete` では `user_id` 条件を**必ず最初に**付け、
「他ユーザーの行が削除されない」ことをテストで固定する。
RPC も同様に、`p_user_id` 引数で絞る前提で設計する。

### `GET /api/watchlist/watched-years`

年セレクトの選択肢を返す。

```jsonc
{
  "success": true,
  "data": {
    "years": [
      { "year": 2025, "count": 3 },
      { "year": 2024, "count": 12 },
    ],
  },
}
```

視聴済みが1件も無い場合は `years: []` を返す（エラーではない）。

### `GET /api/watchlist/watched?year=&cursor=&limit=`

モーダル内に出す対象一覧。既存の一覧ページと同じオフセットページング。

| パラメータ | 内容                                                         |
| ---------- | ------------------------------------------------------------ |
| `year`     | 必須。整数。範囲は `2000` 〜 `2100`                          |
| `cursor`   | 省略時 `0`。オフセット                                       |
| `limit`    | 省略時 `WATCHLIST_DEFAULT_LIMIT`、上限 `WATCHLIST_MAX_LIMIT` |

絞り込み条件:

```
user_id = 自分
deleted_at IS NULL
watched_at IS NOT NULL
added_at >= <year>-01-01T00:00+09:00
added_at <  <year+1>-01-01T00:00+09:00
```

並びは `added_at DESC`。総件数は PostgREST の `count: 'exact'` で取得し、
既存の一覧 API と同じく `next_cursor` / `has_more` を返す。

`year` の範囲を `2000` 〜 `2100` の固定値にするのは、上限を「現在年」にすると
バリデーションが実行時刻に依存してテストが不安定になるため。
未来の年を指定しても対象は0件になるだけで害が無く、固定範囲で異常入力を弾く目的は足りる。

既存の `get_watchlist_sorted` に年フィルタを足さず専用にする。
あの RPC は「視聴済みを常に最後へ送る」並びを抱えており、
視聴済みだけを見るモーダルとは関心が別物のため。

### `POST /api/watchlist/bulk-delete`

```jsonc
// リクエスト
{ "year": 2024, "exclude_ids": ["uuid-a", "uuid-b"] }

// レスポンス
{ "success": true, "message": "...", "data": { "deleted_count": 10 } }
```

`GET /api/watchlist/watched` と同じ絞り込みに `id NOT IN (exclude_ids)` を加えて
`deleted_at = now()` を書き込む。年の範囲は API 側で JST から `timestamptz` に変換して渡すため、
削除クエリに RPC は要らない。

- `exclude_ids` は **上限 1000件**、各要素は UUID 形式を zod で検証する
- `include_ids` への切り替えは入れない。全解除に近い使い方でもボディは数十KBに収まり、
  分岐を増やす利得が無い
- `DELETE` ではなく `POST` にする。ボディ付き `DELETE` は fetch やプロキシで扱いが揺れるため
- レート制限は既存の `RATE_LIMIT_ACTION.WRITE_WATCHLIST`（30回/分）を共有。一括なので 1リクエスト = 1カウント

#### 競合時の扱い

モーダルを開いている間に別タブで視聴済みを外した作品は、削除時の条件に合致せず削除されない。
「すべて選択」は "画面に出ている分" ではなく **"その年の視聴済み全部"** を意味する、という前提で一貫させる。
`deleted_count` は実際に更新された行数を返すので、画面の表示件数と食い違ってもトーストの数字は正しい。

## UI

### 入口

ウォッチリストページのツールバー（`watchlistPage.tsx`）、ソートの `Select` の隣に
`視聴済みを整理` ボタンを置く。

ボタンは**常に表示する**。年一覧の取得はモーダルを開いた後に行うため、
「視聴済みが無いならボタンを隠す」ためだけにページ読み込みでリクエストを足したくない。
視聴済みが1件も無い場合はモーダル内に空状態を出す。

### モーダル

既存の `Modal`（Radix Dialog）を使う。

```
┌─ 視聴済みをまとめて削除 ──────────────┐
│ 追加年: [2024年（12件） ▼]                  │
│ ──────────────────────────────── │
│ [☑ すべて選択]              10件を選択中     │
│                                            │
│  ☑ [ポスター] 映画A            2024-03-01  │
│  ☐ [ポスター] 映画B            2024-03-15  │
│  ☑ [ポスター] 映画C            2024-05-02  │
│   ⋮  （無限スクロール）                     │
│                                            │
│          [ キャンセル ] [ 10件を削除する ]   │
└────────────────────────────────────┘
```

- 年の `Select` のラベルは `2024年（12件）` と件数を併記。**初期選択は最新年**
- 年を切り替えたら除外選択はリセットする（別の年は別の対象で、持ち越す意味が無い）
- リスト末尾の sentinel から既存 `useIntersectionObserver` で追加読み込み（一覧ページと同じ仕組み）
- 削除ボタンのラベルは `N件を削除する`。`N = その年の件数 − 除外数`
- `N = 0` のとき削除ボタンは `disabled`
- 削除は取り消せないため、削除ボタンは既存 `Button` の `variant="danger"` を使う
- 削除中はモーダル全体を操作不可にする
- 視聴済みが1件も無い場合（`years: []`）は、年セレクトとリストの代わりに
  `整理できる視聴済みの作品がありません` を表示する

### アクセシビリティ

- 各行の `Checkbox` に作品タイトルを含む `aria-label` を付ける
- 対象リストは `ul` / `li` で組む（`role` の付与ではなくセマンティック HTML を使う）。
  スタイルは独自クラス名を当て、タグを直接セレクタにしない
- フォーカストラップと ESC は Radix Dialog が担保する
- 削除ボタンのラベルに件数が入るため、件数の変化はフォーカス時に読み上げられる

## 状態管理

`src/features/watchlist/hooks/useWatchlistCleanup.ts`

| 状態                           | 内容                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `selectedYear: number \| null` | 年セレクトの選択値。年一覧の取得完了時に最新年で初期化 |
| `excludeIds: Set<string>`      | チェックを外した ID。年の切り替えでクリア              |
| `years`                        | `useQuery`。`GET /api/watchlist/watched-years`         |
| `items`                        | `useInfiniteQuery`。`GET /api/watchlist/watched`       |
| `bulkDelete`                   | `useMutation`。`POST /api/watchlist/bulk-delete`       |

削除成功時:

1. `N件を削除しました` をトースト表示（`useToast`）
2. ウォッチリスト一覧と年一覧の両方のクエリを invalidate
3. モーダルを閉じる

削除失敗時はトーストでエラーを出し、**モーダルは閉じない**（選択状態をやり直させないため）。

## ファイル構成

```
src/features/watchlist/component/watchlistCleanupModal/
  watchlistCleanupModal.tsx
  watchlistCleanupModal.module.scss
  watchlistCleanupModal.test.tsx
src/features/watchlist/hooks/
  useWatchlistCleanup.ts
  useWatchlistCleanup.test.ts
src/features/watchlist/watchlistPage/watchlistPage.tsx     … ツールバーへボタン追加
src/lib/api/watchlist/watchlist.ts                         … fetch 関数3本を追加
src/schema/watchlist.ts                                    … zod スキーマを追加
src/constants/watchlist.ts                                 … ラベル・上限値を追加
src/app/api/watchlist/watched-years/route.ts   + route.test.ts
src/app/api/watchlist/watched/route.ts         + route.test.ts
src/app/api/watchlist/bulk-delete/route.ts     + route.test.ts
supabase/migrations/<timestamp>_add_watchlist_watched_years_rpc.sql
```

命名は既存の慣習（ファイル lowerCamelCase / コンポーネント PascalCase / API Route kebab-case）に従う。

## テスト

`.claude/rules/testing.md` の観点チェックリストと照合した結果:

| 観点                   | テスト内容                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- |
| 正常系                 | 年を選ぶ → 一覧表示 → 削除 → 件数トースト → 一覧が更新される                     |
| 入力バリデーション     | `year` が非数値 / 範囲外、`exclude_ids` が非UUID、1001件で 400                   |
| 認証・認可             | 未認証で 401。他ユーザーの行が削除されない（下記の注意を参照）                   |
| 空状態・0件            | 視聴済みが1件も無い（`years: []`）→ 空状態表示。全件除外 → 削除ボタン `disabled` |
| エラー応答             | 削除 API 失敗時にトーストを出し、モーダルは閉じない                              |
| 重複・競合             | 既に削除済み / 視聴済みを外した行が対象から落ち、`deleted_count` に含まれない    |
| 期限切れ・試行回数上限 | レート制限超過で 429                                                             |
| 境界値                 | `2025-01-01 05:00 JST`（UTC では前年）が **2025年** に含まれる                   |
| 状態保持・遷移         | 年を切り替えると除外選択がリセットされる                                         |
| アクセシビリティ       | キーボードのみで 年選択 → チェック操作 → 削除 まで到達できる                     |

カバレッジは全指標 80% 以上を維持する。

## 実装順序

1. マイグレーション作成（`added_at` の型移行 → 集計 RPC の順）→ `supabase db push` → 型再生成
2. zod スキーマ・定数 → API 3本 + それぞれのテスト
3. API クライアント → `useWatchlistCleanup` + テスト
4. `WatchlistCleanupModal` + テスト
5. ツールバーへ結線 → ローカル動作確認（Next.js Dev Tools バッジの確認を含む）
6. Before/After スクリーンショットとデモ動画を取得 → PR

## 関連

- 後続の設計: 配信開始された未視聴作品の優先表示（本設計とは独立）
