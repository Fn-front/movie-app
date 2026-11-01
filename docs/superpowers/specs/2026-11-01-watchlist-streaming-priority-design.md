# ウォッチリスト: 配信開始された未視聴作品の優先表示

- 日付: 2026-11-01
- 状態: 設計確定

## 概要

ウォッチリストの未視聴作品のうち、**日本で配信が始まったもの**を一覧の先頭に出し、
カードに提供形態（見放題／レンタル）と配信サービスのロゴを表示する。

詳細を開かなくても「いま U-NEXT で見放題になっている」と分かる状態にする。

## スコープ

### 含む

- ウォッチリストの未視聴作品の配信状況を毎日追う cron と、それを保存するテーブル
- 配信中の作品を先頭に送る並び替え
- カードの提供形態ラベルとプロバイダーロゴ
- 「何を配信とみなすか」のユーザー設定と、ウォッチリストからの導線

### 含まない

- 視聴済み作品の配信状況の追跡（優先表示する理由が無い）
- メール・プッシュによる通知（画面上の優先表示のみ）
- プロバイダー単位の絞り込み（配信タブに既にある）
- 配信期間の履歴（「いつからいつまで配信されていたか」の記録）

## 実測した前提

設計に先立って本番データで確認した（2026-11-01 時点）。

| 項目                                       | 実測値                   |
| ------------------------------------------ | ------------------------ |
| ウォッチリストの未視聴作品                 | 26件（ユニーク映画26件） |
| ユーザー数                                 | 2                        |
| `movie_cache` で配信状況が分かる未視聴作品 | **26件中 1件のみ**       |

未視聴26件の提供形態の内訳:

| 区分                       | 件数 |
| -------------------------- | ---- |
| 見放題あり（flatrate）     | 10件 |
| レンタルのみ（見放題なし） | 5件  |
| 購入のみ                   | 0件  |
| どこにも無い               | 11件 |

ここから2つが決まった。

1. **`movie_cache` には頼れない。** `syncStreamingMovies` は TMDb Discover を人気度と
   公開日ウィンドウで絞るため、ウォッチリストの作品はほとんど載っていない。
   ウォッチリストの作品を直接 TMDb に問い合わせる仕組みが要る
2. **規模が小さい。** 26件なら TMDb 26リクエストで済み、レート制限（50 req/s）に対して
   余裕がある。毎日実行して問題ない

## データ層

### 新テーブル `movie_streaming_status`

作品単位で持つ。同じ映画を複数ユーザーがウォッチリストに入れていても、
TMDb への問い合わせは1回で済む。

```sql
tmdb_movie_id          INTEGER PRIMARY KEY
flatrate_provider_ids  JSONB NOT NULL DEFAULT '[]'  -- 見放題のプロバイダーID（代表IDへ正規化済み）
paid_provider_ids      JSONB NOT NULL DEFAULT '[]'  -- レンタル・購入のプロバイダーID
flatrate_since         TIMESTAMPTZ  -- 今の見放題期間がいつ始まったか
paid_since             TIMESTAMPTZ  -- 今のレンタル・購入期間がいつ始まったか
flatrate_last_seen_at  TIMESTAMPTZ  -- 最後に見放題を確認した日時
paid_last_seen_at      TIMESTAMPTZ  -- 最後にレンタル・購入を確認した日時
flatrate_resumed       BOOLEAN NOT NULL DEFAULT FALSE  -- 一度終了した後の再配信か
paid_resumed           BOOLEAN NOT NULL DEFAULT FALSE
checked_at             TIMESTAMPTZ NOT NULL
```

`rent` と `buy` を `paid` にまとめるのは、実測で「購入のみ」が0件であり、
UI でも「レンタル」の一語で足りるため。分けても表示に差が出ない。

`getJpStreamingAvailability` は `flatrate` / `rent` / `buy` を別々に返すので、
`rent` と `buy` の和集合を取って `paid_provider_ids` に入れる処理は cron 側で行う。

#### RLS と権限

`.claude/rules/supabase-db.md` に従い、`CREATE TABLE` と同じマイグレーションで
RLS を有効化し、GRANT を明示する。GRANT が無いと PostgREST は `42501` を返す。

```sql
ALTER TABLE public.movie_streaming_status ENABLE ROW LEVEL SECURITY;

-- 作品単位の公開情報であり、ユーザーに紐づかない。
-- 書き込みは cron と API（service role）だけが行う
GRANT SELECT ON public.movie_streaming_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_streaming_status TO service_role;
```

`anon` には付与しない。未認証で見る画面にこの情報は出ないため。

RLS ポリシーは `authenticated` の SELECT のみを許可する。ユーザー固有のデータでは
ないので `user_id` による絞り込みは無く、行全体を読める形にする。

なお実際の読み取りは `get_watchlist_sorted` RPC 経由（service role）で行うため、
`authenticated` の SELECT は PostgREST から直接引く将来の用途に備えた最小の付与である。

#### `movie_cache` に相乗りしない理由

1. `movie_cache` の主キーは `(id, release_type)` で、ウォッチリストの作品は release_type が定まらない
2. `movie_cache` は Discover 由来の作品キャッシュで役割が違う
3. 実測で未視聴26件中25件が `movie_cache` に無い。相乗りしても埋まらない

### 配信状況の更新ルール

形態ごと（flatrate / paid）に独立して判定する。

```
今回プロバイダーが取れた場合:
  provider_ids = 今回の値
  last_seen_at = now()
  since が NULL                           → since = now()（初配信）
  since があり、前回も配信中               → since は変えない（継続）
  since があり、前回は空
    last_seen_at から7日以上空いていた     → since = now(), resumed = TRUE（再配信）
    7日未満                                → since は変えない（一時的な欠落とみなす）

今回プロバイダーが空の場合:
  provider_ids = []
  since / last_seen_at / resumed は変えない
```

#### `since` を消さない理由

「配信終了をいつ確定させるか」を決めずに済ませるため。
`provider_ids` が空かどうかが「今観られるか」を表し、`since` は並び順だけに使う。

これにより、プロバイダー移行の過渡期や TMDb のデータが1日欠けたときでも、
**継続配信中の作品が最上位に再浮上しない**（先頭から1日外れて、元の位置に戻るだけ）。

#### 7日という閾値について

「再配信とみなす」境界であり、終了判定ではない。プロバイダー移行の空白は通常数日以内に
収まるという想定だが、根拠は強くない。

**この値がズレても実害は小さい。** 誤って再配信と判定しても、下記の並び順により
先頭グループの**末尾**に回るだけで、最上位には来ない。

### 新 cron `/api/cron/sync-watchlist-streaming`

1. 全ユーザーのウォッチリストから、未削除かつ未視聴のユニーク `tmdb_movie_id` を集める
2. 既存の `getJpStreamingAvailability(movieId)` で JP の配信状況を問い合わせる
   （同時実行数は既存の `TMDB_AVAILABILITY_CONCURRENCY` に合わせる）
3. 上記ルールで `movie_streaming_status` を upsert する

**問い合わせに失敗した作品は現状維持**とし、空に倒さない。
TMDb の一時障害だけで全作品が「配信終了」扱いになるのを避けるため
（既存 `syncStreamingMovies` と同じ方針）。

実行は `sync-streaming`（19:00）の後、**毎日 20:00**。

## 並び替え

`get_watchlist_sorted` RPC に `movie_streaming_status` を LEFT JOIN し、
グループを4つに分ける。既存の「視聴済みは最後」は維持する。

```
① 未視聴 × 配信中 × 初配信（resumed = FALSE）  ← since の新しい順
② 未視聴 × 配信中 × 再配信（resumed = TRUE）   ← since の新しい順
③ 未視聴 × 配信なし                            ← 従来のソート（added_at / release_date_proximity）
④ 視聴済み                                     ← 従来どおり最後
```

### 再配信を②に下げる理由

一度配信が終わった作品は「観る機会があったのに観なかった」ものであり、
初めて観られるようになった作品より優先度が低い。

副次的に、前述の誤判定（一時的欠落を再配信と誤認）の害を吸収する。
誤判定しても最上位には来ず、先頭グループの末尾に回るだけで済む。

①が空なら②が一覧の1番目に出る。「観られる作品が手前にある」という目的は満たせている。

### どの形態を「配信中」とみなすか

ユーザー設定で切り替える（下記）。

- `any`（初期値）: `flatrate_provider_ids` か `paid_provider_ids` のいずれかが空でない
- `flatrate`: `flatrate_provider_ids` が空でない

並び順に使う `since` は、設定に応じて該当する形態のものを見る。
`any` で両方に値がある場合は新しい方を使う。

PR1 では設定を作らないため、RPC は引数を取らず `any` 相当で固定する。
PR2 で `p_streaming_scope` 引数を追加し、設定を反映させる。

### サイドバーには適用しない

`get_watchlist_sorted` はウォッチリストページだけでなく、サイドバーの
「公開日が近い映画」でも使われている（`sort=release_date_proximity`、
`exclude_watched=true`、上位10件）。

ここに配信中を先頭へ送る並びを持ち込むと、**見出しと中身が食い違う**。
公開日順に見たいのに配信中の旧作が上に来てしまう。

RPC に `p_prioritize_streaming BOOLEAN DEFAULT FALSE` を足し、
ウォッチリストページの一覧取得だけが `TRUE` を渡す。
サイドバーは既定の `FALSE` のままで従来の並びを保つ。

## 表示

### カードのバッジ

優先表示された作品（①②）のカードに、提供形態とサービスを出す。

```
┌──────────────┐
│   [ポスター]     │
│ ⬛見放題 (N)(U)   │ ← ラベル + プロバイダーロゴ
│ 罪人たち         │
└──────────────┘
```

- ラベルは `見放題` / `レンタル` の2種類
- 両方で観られる場合は `見放題` を優先して出す（追加料金なしで観られる方が情報として強い）
- ロゴは `WATCH_PROVIDERS` の9サービスに限る。それ以外のプロバイダーはロゴを出さず
  ラベルのみ。TMDb は JP で71サービスを返すが、34件は Amazon Channel 系で
  並べても判別できない（`src/constants/movies.ts` の既存コメント参照）
- ロゴは**最大3つ**。溢れたら `+N` と出す

### プロバイダーロゴの取得

`WATCH_PROVIDERS` の各要素に `logoPath` を追記する（静的）。
TMDb から毎回引くとウォッチリスト表示のたびに追加リクエストが要るため。
パスが変わることは稀で、変わってもロゴが出ないだけで機能は壊れない。

9サービスすべて取得済みで、画像も `image.tmdb.org` から 200 で返ることを確認した。
`next.config.mjs` の `remotePatterns` に `image.tmdb.org/t/p/**` が既にあるため、
設定変更は不要。

### API

既存の `GET /api/watchlist` のレスポンスに各アイテムの配信情報を足す。
新しいエンドポイントは作らない。

```jsonc
{
  "id": "...",
  "title": "罪人たち",
  // 追加分
  "streaming": {
    "offer_type": "flatrate", // "flatrate" | "paid" | null（配信なし）
    "provider_ids": [84, 8],
    "resumed": false,
  },
}
```

## 設定と導線

### 設定

`users` テーブルに列を1つ追加し、既存の `GET/PATCH /api/user/settings` に含める。

```sql
streaming_notice_scope TEXT NOT NULL DEFAULT 'any'  -- 'any' | 'flatrate'
```

`user_preferences` テーブルは使わない（定義だけあって未使用であり、
`theme` / `notification_enabled` は `users` に置かれている。既存に揃える）。

設定ページの「通知設定」に項目を追加する。

```
配信開始のお知らせ
  ◉ レンタル・購入も含める
  ○ 見放題になったときだけ
```

### 導線

優先表示グループの見出し横に ⓘ アイコンを置き、ツールチップで設定の存在を知らせる。
設定ページに埋もれて気づかれないのを防ぐため。

```
観られる作品  ⓘ
            └─ 見放題・レンタルを対象にしています。
               設定から変更できます →
```

`@radix-ui/react-tooltip` を依存に追加し、`src/components/ui/tooltip/` として
他画面でも使える形で作る。既存の Radix 群（dialog / select / checkbox）と同じファミリで、
キーボード操作とスクリーンリーダー対応が標準で付く。

## テスト

`.claude/rules/testing.md` の観点チェックリストと照合した結果:

| 観点               | テスト内容                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| 正常系             | 配信中の未視聴が先頭に出る。バッジとロゴが出る                                                                  |
| 状態遷移           | 初配信 → since 記録 / 継続 → since 不変 / 7日未満の欠落 → since 不変 / 7日以上空けて復活 → since 更新 + resumed |
| 並び順             | ①初配信 → ②再配信 → ③配信なし → ④視聴済み。①が空なら②が1番目                                                    |
| 入力バリデーション | `streaming_notice_scope` が 'any' / 'flatrate' 以外なら 400                                                     |
| 認証・認可         | cron は `CRON_SECRET` 必須。設定更新は未認証で 401                                                              |
| 空状態・0件        | 配信中が1件も無いとき、従来どおりの並びになる                                                                   |
| 既存機能への影響   | **サイドバー（公開日が近い映画）の並びが変わらない**こと                                                        |
| エラー応答         | TMDb 問い合わせ失敗時に既存の値を保持する（空に倒さない）                                                       |
| 境界値             | 欠落からちょうど7日後の復活                                                                                     |
| 表示の上限         | プロバイダーが4つ以上のとき `+N` が出る                                                                         |
| 未知のプロバイダー | `WATCH_PROVIDERS` 外のIDはロゴを出さずラベルのみ                                                                |
| アクセシビリティ   | ツールチップがキーボードで開ける。バッジに適切な代替テキスト                                                    |

カバレッジは全指標 80% 以上を維持する。

## スキーマ変更の手順

テーブル追加・列追加・RPC の差し替えはすべて `supabase migration new <name>` で
マイグレーション化する（ダッシュボードでの直接変更は禁止）。

適用後は必ず型を再生成する。

```bash
npx supabase db push
npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
npx prettier --write src/types/database.types.ts
```

生成物は Prettier 未適用の形で出るため、整形まで含めて1手順とする
（整形を忘れると CI の Prettier Check が落ちる）。

RPC（`get_watchlist_sorted`）は引数が増えるため、`CREATE OR REPLACE` では
置き換えられない。`DROP FUNCTION` してから作り直し、**権限を明示的に書き直す**
（`DROP` → `CREATE` では既定付与が復活しうる）。

## 実装の分割

2つの PR に分ける。

**PR1: 追跡基盤 + 優先表示**
マイグレーション（`movie_streaming_status` + RLS/GRANT、`get_watchlist_sorted` の差し替え）、
cron、API レスポンス拡張、カードのバッジとロゴ。設定は作らず `any` 固定で動かす。
**ここまでで機能として完結する。**

**PR2: ユーザー設定 + 導線**
`users.streaming_notice_scope` の列追加、`get_watchlist_sorted` への引数追加、
設定 API と設定ページ、Tooltip コンポーネント、ウォッチリストの ⓘ 導線。

## 関連

- 前提: #897（視聴済みの一括削除。`added_at` の TIMESTAMPTZ 移行を含む）
- 既存の配信同期: `src/lib/sync/syncStreamingMovies.ts`（Discover 由来、本機能とは対象が異なる）
