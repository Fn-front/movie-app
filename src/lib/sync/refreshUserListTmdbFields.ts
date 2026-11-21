/**
 * 利用者リストの TMDb 由来列を取り直す（#433 の作業3）
 *
 * `favorites` / `watchlist` / `dismissed_movies` は、利用者が登録した時点の
 * TMDb の値を非正規化して保存したきりで、更新する仕組みが無かった。
 * TMDb 利用規約 Section 1.C の「6ヶ月を超えてキャッシュしない」に抵触する。
 *
 * ⚠️ **`movie_cache` を正にして上書きするだけでは足りない。** 検索結果から
 * 直接登録できるため、`movie_cache` に載っていない作品が多数派になる
 * （本番実測で favorites の 84% / watchlist の 48% / dismissed_movies の 100%）。
 * 「あればキャッシュから、無ければ TMDb から」のハイブリッドにする。
 *
 * ⚠️ `dismissed_movies` だけは**常に TMDb から取る**。推薦シグナル
 * （`director_name` / `keywords`）が `movie_cache` に無いため、キャッシュを
 * 見ても結局 TMDb へ問い合わせることになる。対象も8件しかない。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { MS_PER_DAY } from '@/constants/time';
import {
  NOT_FOUND_ABORT_RATIO,
  USER_LIST_REFRESH_CONCURRENCY,
  USER_LIST_REFRESH_LIMIT,
  USER_LIST_REFRESH_STALE_DAYS,
} from '@/constants/userListRefresh';
import { createItemOutcome, type ItemOutcome } from '@/lib/cron/itemOutcome';
import {
  getMovieListRefreshFields,
  isTmdbNotFoundError,
} from '@/lib/tmdb/tmdb';
import type { UserListRefreshFields } from '@/lib/types';

/** 取り直しの対象テーブル */
const TARGET_TABLES = ['favorites', 'watchlist', 'dismissed_movies'] as const;

type TargetTable = (typeof TARGET_TABLES)[number];

/**
 * `movie_cache` を参照してよいテーブル
 *
 * `dismissed_movies` が入っていないのは、`director_name` / `keywords` が
 * `movie_cache` に無く、どのみち TMDb を引くことになるため。
 */
const CACHE_BACKED_TABLES: readonly TargetTable[] = ['favorites', 'watchlist'];

/** テーブルごとの結果 */
export interface UserListRefreshTableResult {
  name: TargetTable;
  /** 取り直しの対象として拾った行数 */
  scanned: number;
  /** 表示列を更新できた行数 */
  refreshed: number;
  /** TMDb で 404 だったため削除予定として印を付けた行数 */
  markedDeleted: number;
  /** 上限に当たって積み残したか */
  truncated: boolean;
}

/** 取り直し全体の結果 */
export interface UserListRefreshResult {
  tables: UserListRefreshTableResult[];
  /** `movie_cache` から解決した作品数 */
  fromCache: number;
  /** TMDb から取得した作品数 */
  fromTmdb: number;
  /** TMDb API の呼び出し回数 */
  tmdbRequests: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  errors: string[];
  /** 作品単位の集計（#1354） */
  items: ItemOutcome;
  /**
   * 404 が多すぎて印付けを中止したか（#433 レビュー指摘）
   *
   * ⚠️ これが true のとき、ルートは**無条件で通知する**。
   * `notifyIfMostlyFailed` の率判定（failed/attempted）では拾えない。
   */
  abortedByNotFoundRatio: boolean;
}

/** 取り直し対象の行 */
interface StaleRow {
  id: string;
  tmdb_movie_id: number;
}

/** 配列を指定サイズのチャンクに分割する */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * テーブルごとの UPDATE ペイロードを組み立てる
 *
 * ⚠️ テーブルによって持っている列が違う。`watchlist` に `genre_ids` は無く、
 * `favorites` に `genre_ids` も無い（初期スキーマからそう）。無い列を入れると
 * PGRST204 で UPDATE が丸ごと落ちる。
 */
function buildRefreshPayload(
  table: TargetTable,
  fields: UserListRefreshFields,
  refreshedAt: string,
): Record<string, unknown> {
  const common = {
    // title は NOT NULL 制約がある。TMDbが空を返したときは既存値を残す
    ...(fields.title ? { title: fields.title } : {}),
    poster_path: fields.posterPath,
    tmdb_refreshed_at: refreshedAt,
  };

  if (table === 'dismissed_movies') {
    return {
      ...common,
      genre_ids: fields.genreIds,
      director_name: fields.directorName,
      keywords: fields.keywords.length > 0 ? fields.keywords : null,
      release_year: fields.releaseYear,
    };
  }

  return { ...common, release_date: fields.releaseDate };
}

/**
 * 取り直しの対象を拾う
 *
 * 生きている行（論理削除も 404 検知もされていない）のうち、まだ取り直して
 * いないか、十分に古いものを `tmdb_refreshed_at` の昇順で拾う。
 * NULL（未取得）が先に来る。
 *
 * ⚠️ 条件は `idx_*_tmdb_refreshed_at` の部分索引と一致させること。
 */
async function selectStaleRows(
  supabase: SupabaseClient,
  table: TargetTable,
  staleBefore: string,
): Promise<{ rows: StaleRow[]; error?: string }> {
  const { data, error } = await supabase
    .from(table)
    .select('id, tmdb_movie_id')
    .is('deleted_at', null)
    .is('tmdb_deleted_at', null)
    .or(`tmdb_refreshed_at.is.null,tmdb_refreshed_at.lt.${staleBefore}`)
    .order('tmdb_refreshed_at', { ascending: true, nullsFirst: true })
    .limit(USER_LIST_REFRESH_LIMIT);

  if (error) return { rows: [], error: error.message };

  return { rows: (data ?? []) as StaleRow[] };
}

/**
 * `movie_cache` から解決できる作品を引く
 *
 * ⚠️ 同じ ID が theatrical / streaming の2行になりうる（PK は
 * `(id, release_type)`）。**先に来たほうを採る**。表示列はどちらの行でも
 * 同じ値になるので選択規則で結果は変わらない。
 *
 * ⚠️ ただし `release_date` は違う。リバイバル行では映画.com の再上映日が
 * 入っており、お気に入り一覧に「元の公開日」として出すと誤解を招く。
 * リバイバル行は除外して TMDb 側へ回す。
 */
async function loadFromMovieCache(
  supabase: SupabaseClient,
  movieIds: number[],
): Promise<Map<number, UserListRefreshFields>> {
  const resolved = new Map<number, UserListRefreshFields>();
  if (movieIds.length === 0) return resolved;

  for (const batch of chunk(movieIds, 200)) {
    const { data } = await supabase
      .from('movie_cache')
      .select('id, title, poster_path, release_date, genre_ids')
      .in('id', batch)
      .eq('is_revival', false);

    for (const row of data ?? []) {
      if (resolved.has(row.id)) continue;
      resolved.set(row.id, {
        title: row.title ?? null,
        posterPath: row.poster_path ?? null,
        releaseDate: row.release_date ?? null,
        genreIds: Array.isArray(row.genre_ids) ? row.genre_ids : [],
        // `movie_cache` は推薦シグナルを持たない。
        // これらを使うのは dismissed_movies だけで、あちらはキャッシュを見ない
        directorName: null,
        keywords: [],
        releaseYear: null,
      });
    }
  }

  return resolved;
}

/**
 * TMDb で消えた作品に印を付ける（#433 案D）
 *
 * 行は残し、`tmdb_deleted_at` **だけ**を立てる。利用者が自分で登録した
 * ものなので黙って消さず、画面で知らせてから猶予後に物理削除する。
 *
 * ⛔ **表示列を NULL で潰さないこと。** 初版は `title` 以外を NULL に
 * していたが、次の3つが同時に成り立つため危険だった。
 *
 *   1. 解除する経路が無い（`tmdb_deleted_at` を NULL へ戻すコードは1行も無い）
 *   2. 印の付いた行は抽出条件 `.is('tmdb_deleted_at', null)` から外れ、
 *      **二度と取り直されない**
 *   3. つまり誤検知1回で、ポスターも公開日も**永久に失われる**
 *
 * TMDb 規約（6ヶ月）は NULL 化ではなく**猶予後の物理削除**で満たす。
 * 画面のバッジに要るのは `tmdb_deleted_at` だけで、潰す必要が無い
 * （`get_watchlist_sorted` が返すのもこの列）。
 *
 * ⚠️ 潰さないことで操作が可逆になり、将来「リフレッシュが成功したら印を
 * 解除する」を足せる。初版の形では解除しても中身が戻らなかった。
 */
function buildTmdbDeletedPayload(
  _table: TargetTable,
  deletedAt: string,
): Record<string, unknown> {
  return { tmdb_deleted_at: deletedAt };
}

/**
 * 利用者リストの TMDb 由来列を取り直す
 *
 * @returns テーブルごとの件数とメトリクス
 */
export async function refreshUserListTmdbFields(): Promise<UserListRefreshResult> {
  const startedAt = Date.now();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase環境変数が設定されていません');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: UserListRefreshResult = {
    tables: [],
    fromCache: 0,
    fromTmdb: 0,
    tmdbRequests: 0,
    durationMs: 0,
    errors: [],
    items: createItemOutcome(),
    abortedByNotFoundRatio: false,
  };

  const staleBefore = new Date(
    Date.now() - USER_LIST_REFRESH_STALE_DAYS * MS_PER_DAY,
  ).toISOString();

  // 1. テーブルごとに対象を拾う
  const staleByTable = new Map<TargetTable, StaleRow[]>();

  for (const table of TARGET_TABLES) {
    const { rows, error } = await selectStaleRows(supabase, table, staleBefore);

    if (error) {
      // ⚠️ `errors` だけに積むと、**1件も処理していないのに failed が 0** に
      //    なり率の判定（notifyIfMostlyFailed）に乗らない（#1354 と同じ形）
      result.errors.push(`${table} select: ${error}`);
      result.items.attempted++;
      result.items.failed++;
      result.tables.push({
        name: table,
        scanned: 0,
        refreshed: 0,
        markedDeleted: 0,
        truncated: false,
      });
      continue;
    }

    staleByTable.set(table, rows);

    const truncated = rows.length === USER_LIST_REFRESH_LIMIT;

    // ⚠️ 黙って切らない。「全部取り直した」ように見えると違反が残る
    if (truncated) {
      console.warn(
        `[refresh-user-lists] ${table} が上限 ${USER_LIST_REFRESH_LIMIT} 件に達しました。` +
          '残りは次回の実行で取り直します',
      );
    }

    result.tables.push({
      name: table,
      scanned: rows.length,
      refreshed: 0,
      markedDeleted: 0,
      truncated,
    });
  }

  // 2. `movie_cache` で解決できるぶんを先に引く
  //
  // ⚠️ dismissed_movies のIDは混ぜない。あちらは推薦シグナルが要るので
  //    どのみち TMDb を引くことになり、キャッシュを引く意味が無い
  const cacheBackedIds = [
    ...new Set(
      CACHE_BACKED_TABLES.flatMap((table) =>
        (staleByTable.get(table) ?? []).map((row) => row.tmdb_movie_id),
      ),
    ),
  ];

  const cached = await loadFromMovieCache(supabase, cacheBackedIds);

  // 3. TMDb から取るぶんを決める
  //
  // テーブルを跨いで同じ作品が対象になることがあるため、ID で重複を排除する
  const tmdbIds = [
    ...new Set(
      TARGET_TABLES.flatMap((table) =>
        (staleByTable.get(table) ?? [])
          .map((row) => row.tmdb_movie_id)
          .filter(
            (movieId) =>
              !CACHE_BACKED_TABLES.includes(table) || !cached.has(movieId),
          ),
      ),
    ),
  ];

  const fetched = new Map<number, UserListRefreshFields>();
  /** TMDb で 404 だった作品 */
  const notFound = new Set<number>();

  for (const batch of chunk(tmdbIds, USER_LIST_REFRESH_CONCURRENCY)) {
    const settled = await Promise.all(
      batch.map(async (movieId) => {
        try {
          return { movieId, fields: await getMovieListRefreshFields(movieId) };
        } catch (error) {
          if (isTmdbNotFoundError(error)) {
            return { movieId, fields: null, gone: true };
          }
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`tmdb ${movieId}: ${message}`);
          return { movieId, fields: null, gone: false };
        }
      }),
    );

    result.tmdbRequests += batch.length;
    result.items.attempted += batch.length;

    for (const entry of settled) {
      if (entry.fields) {
        fetched.set(entry.movieId, entry.fields);
        continue;
      }
      if ('gone' in entry && entry.gone) {
        notFound.add(entry.movieId);
        continue;
      }
      // 一時障害。現状維持にして次回へ送る
      result.items.failed++;
    }
  }

  result.fromCache = cached.size;
  result.fromTmdb = fetched.size;

  // ⛔ **404 が面で返ってきたら印を付けない**（#433 レビュー指摘）。
  //
  //   TMDb 側の障害・エンドポイント変更・認証事故で 404 が大量に返ると、
  //   1回の実行で生存行すべてに `tmdb_deleted_at` が立つ。404 は
  //   `items.failed` に入らないので**失敗率は 0%** のまま、200 /
  //   `success: true` で終わり、通知も飛ばない。
  //
  //   1件ごとの 404 判定（`isTmdbNotFoundError`）は正しいが、
  //   **全体として異常かどうか**を見る層がどこにも無かった。本筋の同期が
  //   `streamingIds.size > 0 && !truncated` で自衛しているのと同じ発想で、
  //   比率で足切りする。
  //
  //   作品が TMDb から消えるのは本来まれなので、閾値は低めでよい。
  //   取りこぼしても次回の実行で拾い直せる（印を付けないだけで、
  //   `tmdb_refreshed_at` も進めない）。
  if (
    result.tmdbRequests > 0 &&
    notFound.size / result.tmdbRequests > NOT_FOUND_ABORT_RATIO
  ) {
    result.errors.push(
      `404 の比率が高すぎます（${notFound.size}/${result.tmdbRequests}）。` +
        '削除予定の印付けを中止しました',
    );
    result.abortedByNotFoundRatio = true;
    notFound.clear();
  }

  // 4. 行へ書き戻す
  const refreshedAt = new Date().toISOString();

  for (const table of TARGET_TABLES) {
    const rows = staleByTable.get(table) ?? [];
    const tableResult = result.tables.find((t) => t.name === table);
    if (!tableResult) continue;

    for (const row of rows) {
      const movieId = row.tmdb_movie_id;

      if (notFound.has(movieId)) {
        const { error } = await supabase
          .from(table)
          .update(buildTmdbDeletedPayload(table, refreshedAt))
          .eq('id', row.id);

        if (error) {
          result.errors.push(`${table} mark-deleted: ${error.message}`);
          result.items.failed++;
          continue;
        }

        tableResult.markedDeleted++;
        continue;
      }

      const fields = CACHE_BACKED_TABLES.includes(table)
        ? (cached.get(movieId) ?? fetched.get(movieId))
        : fetched.get(movieId);

      // 取得に失敗した作品は現状維持。`tmdb_refreshed_at` も進めないので
      // 次回また対象になる
      if (!fields) continue;

      const { error } = await supabase
        .from(table)
        .update(buildRefreshPayload(table, fields, refreshedAt))
        .eq('id', row.id);

      if (error) {
        result.errors.push(`${table} update: ${error.message}`);
        // ⚠️ TMDb は成功していても書き込みが全滅する経路がある（列名の typo で
        //    PGRST204 / GRANT 漏れ）。数えないと 200・通知なしで沈黙する
        result.items.failed++;
        continue;
      }

      tableResult.refreshed++;
    }
  }

  result.durationMs = Date.now() - startedAt;

  console.log(
    `[refresh-user-lists] ${result.tables
      .map(
        (t) =>
          `${t.name}(scanned=${t.scanned} refreshed=${t.refreshed} deleted=${t.markedDeleted})`,
      )
      .join(' ')} fromCache=${result.fromCache} fromTmdb=${result.fromTmdb} ` +
      `tmdbRequests=${result.tmdbRequests} durationMs=${result.durationMs} ` +
      `errors=${result.errors.length}`,
  );

  return result;
}
