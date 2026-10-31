# 地域（原語）フィルタ設計

作成日: 2026-10-31

## 背景

映画タブ・配信タブの一覧に、韓国・中華圏・タイ・インドの作品が混ざる。これらを既定では
表示せず、ユーザーが検索条件で表示を切り替えられるようにしたい。

現在の言語フィルタ（`ALLOWED_LANGUAGES` / `src/constants/movies.ts`）は**保存時に弾くだけ**で、
保存後の行からは原語が分からない。`movie_cache` に `original_language` 列が無いためである。
ユーザーが切り替えられるようにするには、行ごとに原語を保存する必要がある。

なお `ALLOWED_LANGUAGES` には対象言語（`ko` / `zh` / `th` / `hi` / `te` / `ta`）が
「日本の配信市場では需要が大きい」という理由で意図的に含まれている。本設計はこの判断を
変えず、**保存は従来どおり行い、読み取り時に絞る**。

## 要件

| 項目 | 決定 |
|---|---|
| グルーピング | 地域ごとに3グループ |
| 既定の挙動 | 3グループすべて非表示 |
| 切り替え箇所 | 映画タブ・配信タブの検索条件（フィルタモーダル） |
| 既定を効かせる層 | `/api/movies`（APIの既定） |
| 既存ユーザーの保存済みフィルタ | 一律適用（ある日から非表示になる） |
| 広東語（`cn`） | 追加しない |

### 地域グループ

| グループキー | 表示名 | `original_language` |
|---|---|---|
| `korea` | 韓国 | `ko` |
| `chinese` | 中華圏 | `zh` |
| `thai_indian` | タイ・インド | `th` / `hi` / `te` / `ta` |

TMDb は広東語を `cn`、北京語を `zh` と別コードで持つが、`ALLOWED_LANGUAGES` に `cn` が
無いため広東語作品はそもそも保存されていない。今回も追加しない。

## データモデル

`movie_cache` に `original_language` を追加する。

```sql
ALTER TABLE movie_cache ADD COLUMN original_language VARCHAR(10);

COMMENT ON COLUMN movie_cache.original_language IS
  'TMDbの原語（ISO 639-1）。地域フィルタの絞り込みに使う。NULLは未取得を表し、除外対象にしない。';
```

**インデックスは作らない。** 読み取り側の述語は
`original_language IS NULL OR original_language NOT IN (...)` という否定形で、かつ
原語は数十種しかない低カーディナリティ列である。B-tree は選択されず、書き込みコスト
だけが増える。`movie_cache` は 1,142 行（2026-10-31 時点）でシーケンシャルスキャンでも
十分速い。行数が桁で増えたら `EXPLAIN` で再評価する。

**言語コードをそのまま持ち、地域へのグルーピングはアプリ側の定数で行う。** 地域を列に
持つと、グループ分けを変えるたびにマイグレーションとバックフィルが必要になる。

グルーピングの定数は `src/constants/movies.ts` に置く。

```ts
export const REGION_LANGUAGE_GROUPS = {
  korea: ['ko'],
  chinese: ['zh'],
  thai_indian: ['th', 'hi', 'te', 'ta'],
} as const;

export const REGION_GROUP_KEYS = ['korea', 'chinese', 'thai_indian'] as const;
export type RegionGroupKey = (typeof REGION_GROUP_KEYS)[number];
```

列追加のみでテーブルは新規でないため、GRANT の追加は不要（既存の
`GRANT ... ON public.movie_cache` がそのまま有効）。

## API契約

`/api/movies` に `include_regions` を追加する（カンマ区切り、省略可）。

```
GET /api/movies?release_type=theatrical&include_regions=korea,chinese
```

| 指定 | 挙動 |
|---|---|
| 未指定 | 3グループすべて除外（**既定**） |
| `korea` | 韓国のみ結果に含め、中華圏・タイ・インドは除外 |
| `korea,chinese,thai_indian` | すべて含める（従来の挙動） |

`original_language IS NULL` の行は**常に含める**。列追加直後は全行が NULL であり、除外に
倒すと一覧が空になるため。バックフィルが進むにつれて自然に絞り込みが効き始める。

### バリデーション

`src/schema/movies.ts` の `moviesQuerySchema` に追加する。既存の `offer_types` と同じ
「カンマ区切り文字列 → enum 配列」のパターンに揃える。

```ts
include_regions: z
  .string()
  .transform((val) => val.split(','))
  .pipe(z.array(z.enum(REGION_GROUP_KEYS)))
  .optional(),
```

### 保存済みフィルタ

`src/schema/filters.ts` の `filterConditionsSchema` にも同じキーを追加する。

```ts
include_regions: z.array(z.enum(REGION_GROUP_KEYS)).optional(),
```

`saved_filters.filter_conditions` は JSONB なのでマイグレーションは不要。既存レコードには
このキーが無く「未指定 → 除外」が適用される。これは要件どおりの意図した挙動である。

## 書き込み側

TMDb のレスポンスには `original_language` が含まれているため（`src/lib/types/index.ts:34`）、
**追加の TMDb 呼び出しは発生しない**。

| 経路 | ファイル | 対応 |
|---|---|---|
| Now Playing 同期 | `src/lib/sync/syncNowPlayingMovies.ts` | RPC の引数に列を追加 |
| `/api/movies` Discover | `src/app/api/movies/route.ts` | 同上（同じ RPC） |
| 配信同期 | `src/lib/sync/syncStreamingMovies.ts` | 直接 upsert に列を追加 |
| 映画.com iCal 同期 | `src/lib/eiga/syncEigaMovies.ts` | 直接 upsert に列を追加 |

### RPC の更新

`upsert_movie_cache(JSONB, BOOLEAN)` の INSERT 列リスト・SELECT・`ON CONFLICT DO UPDATE SET`
に `original_language` を追加する。

`CREATE OR REPLACE` は既存権限を保持するが、`.claude/rules/supabase-db.md` に従い
`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` と
`GRANT EXECUTE ... TO service_role` を同じマイグレーションに明示的に書き直す。

## 既存行のバックフィル

### 継続的な更新

`update-movies` の日次 cron（`src/lib/sync/updateMoviesCacheByBatch.ts`）に組み込む。

`getMovieCacheStats` は既に `/movie/{id}` の詳細を全件ぶん取得しているため、返り値に
`originalLanguage` を足して `UPDATE` に含めるだけでよい。**追加の TMDb コストはゼロ**。

```
src/lib/tmdb/tmdb.ts                       getMovieCacheStats の返り値に originalLanguage を追加
src/lib/sync/updateMoviesCacheByBatch.ts   UPDATE に original_language を追加
```

### 初回の一括埋め

日次 cron を待たず、マイグレーション適用後に**一度だけ手動でバックフィルを実行する**。
これによりリリース直後からフィルタが機能する。

対象は 2026-10-31 時点で**ユニーク映画ID 1,112 件**（総行数 1,142）。TMDb のレート制限
（50 req/s）に対し同時実行を 10 に絞っても 30 秒弱で完了する。日次 cron が毎日こなしている
量と同じであり、負荷上の問題はない。

バックフィル専用のスクリプトはリポジトリに残さない。SQL では完結せず（TMDb への問い合わせが
必要）、かつ日次 cron が同じ処理を恒常的に行うため、永続化する価値がない。

## 読み取り側

`src/helpers/movieCacheFilters.ts` の `MovieCacheFilters` に除外言語を追加する。

```ts
/** 除外する原語（空配列なら言語で絞らない）。NULL行は常に含める */
excludedLanguages: string[];
```

```ts
if (filters.excludedLanguages.length > 0) {
  filtered = filtered.or(
    `original_language.is.null,original_language.not.in.(${filters.excludedLanguages.join(',')})`,
  );
}
```

`.or()` を複数回呼ぶ形になるが、ジャンルと配信プロバイダーで既に同じ組み立てをしており、
PostgREST は複数の `or=` を AND で結合する。

`/api/movies` 側では `include_regions` から除外言語を導出する。

```ts
const includedRegions = include_regions ?? [];
const excludedLanguages = REGION_GROUP_KEYS
  .filter((key) => !includedRegions.includes(key))
  .flatMap((key) => REGION_LANGUAGE_GROUPS[key]);
```

総件数クエリとデータ取得クエリは既に `applyMovieCacheFilters` を共通で通しているため、
条件のずれによるページング破綻は起きない。

## UI

`src/components/ui/movie/filterModal/filterModal.tsx` に「地域」セクションを追加する。

- 3つのチェックボックス（韓国 / 中華圏 / タイ・インド）、既定はすべて OFF
- 既存セクション（公開日・リバイバル・ジャンル・配信サービス）と同じ
  `c_filter__section` / `c_filter__section_title` の構造に揃える
- `fieldset` + `legend` でグループ化し、`legend` は視覚的に隠す（既存のリバイバル欄と同じ）
- 映画タブ・配信タブの両方で表示する（配信サービス欄のように `streaming` 限定にはしない）

状態は `src/features/movies/hooks/useMovieList.ts` が持つ既存のフィルタ状態に合わせて追加する。

## スコープ外

以下は今回の対象としない。

| 対象 | 理由 |
|---|---|
| 検索（`/api/movies/search`） | ユーザーが明示的に探した結果であり、隠す理由がない |
| 人物フィルモグラフィ（`/api/person/[id]`） | 出演作の一覧であり、欠落させると不正確になる |
| ホームの横スクロール（`now_showing_movies`） | 別テーブル。`movie_cache` の列追加では解決しない |
| レコメンド（`recommendations`） | 別テーブル。AI生成の結果であり別の論点 |
| 受賞作品（`award_movies`） | 別テーブル |
| `ALLOWED_LANGUAGES` の変更 | 保存は従来どおり行う。読み取り時に絞る方針のため |

## テスト方針

`.claude/rules/testing.md` の観点チェックリストに沿って、以下を網羅する。

| 観点 | 対象 |
|---|---|
| 正常系 | `include_regions` 指定時に該当地域が含まれる |
| 既定 | `include_regions` 未指定で3グループが除外される |
| 入力バリデーション | 未知のグループキー、空文字、上限超過 |
| 空状態・0件 | 全地域を除外した結果が0件のとき |
| 状態保持 | `saved_filters` に保存・復元される／リロード後も保持される |
| 境界 | `original_language IS NULL` の行が常に含まれる |
| ページング | 総件数クエリとデータクエリで件数が一致する |
| アクセシビリティ | チェックボックスのラベル・キーボード操作・`fieldset`/`legend` |

対象ファイルごとに `<filename>.test.ts(x)` を同じディレクトリに置き、全指標 80% 以上を維持する。

E2E はユーザーストーリー「アジア圏の作品を表示に含める／外す」を1本追加する。

## 判断の記録

### 言語コードを持ち、地域は定数でまとめる

地域を列に持つ案（`region_group`）は、グループ分けの変更ごとにマイグレーションと
全行バックフィルが必要になる。原語は TMDb が返す生データであり、グルーピングは表示側の
関心事なので、アプリ側の定数に置く。

### 既定を API 層で効かせる

UI の初期値だけで既定を表現する案は、URL 直叩き・初回のサーバーレンダリング・保存済み
フィルタが無いユーザーで挙動がぶれる。API の既定にすることで経路によらず一貫する。

### NULL を除外対象にしない

列追加直後は全行 NULL であり、除外に倒すと一覧が空になる。「未取得」と「対象地域」は
区別すべき状態であり、未取得を根拠に非表示にはしない。

### 既存ユーザーの保存済みフィルタを補填しない

マイグレーションで既存の `saved_filters` に「全地域を表示」を書き込む案もあったが、
全ユーザーで挙動を揃える方を優先した。既存ユーザーには適用時点からアジア圏が
非表示になる。

## リスク

- **バックフィル後に追加された行は一時的に NULL になる。** 初回の一括埋めで既存行は
  埋まるが、以降に各同期経路が追加する行は書き込み側の対応に依存する。4経路すべてに
  列を通すことで塞ぐ（漏れた経路の行は NULL のまま表示され続け、絞り込みから漏れる）。
- **`update-movies` の打ち切り。** 同 cron は TMDb を1件ずつ直列で叩いており
  `maxDuration = 300` の上限がある。打ち切られた場合、その回の更新は翌日以降に
  持ち越される（打ち切り自体は `errors[]` に載らない）。継続的な更新経路としては
  既存の制約をそのまま引き継ぐ。
- **`.or()` の増加。** 言語条件で `or=` が1つ増える。ジャンル・配信プロバイダーと併用した
  ときのクエリ長とプラン悪化を、実データで確認する必要がある。
