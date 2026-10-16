/**
 * 一覧画面のフィルター状態とURLクエリの相互変換
 *
 * フィルターをURLに持たせることで、未認証ユーザーでもページ遷移後の
 * ブラウザバックで状態が復元され、URL共有も可能になる。
 *
 * 復元時の値は外部入力（手打ちURL・古いブックマーク）になりうるため、
 * `filterConditionsSchema` を単一ソースとしてフィールド単位で検証し、
 * 不正値は黙ってデフォルトへフォールバックする（例外は投げない）。
 */

import { MOVIE_FILTER_QUERY_PARAMS } from '@/constants/queryParams';
import { filterConditionsSchema } from '@/schema/filters';
import type { FilterConditions } from '@/schema/filters';

/**
 * スキーマの該当フィールドで検証し、不正なら undefined を返す
 */
function parseField<K extends keyof typeof filterConditionsSchema.shape>(
  key: K,
  value: unknown,
): FilterConditions[K] | undefined {
  if (value === undefined) return undefined;
  const result = filterConditionsSchema.shape[key].safeParse(value);
  return result.success ? (result.data as FilterConditions[K]) : undefined;
}

/**
 * `genre_ids=28,12` 形式の文字列を数値配列に変換する
 *
 * @returns 有効なIDが1件以上あれば配列、無ければ undefined
 */
function parseGenreIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;

  const ids = raw
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.length > 0 ? ids : undefined;
}

/**
 * `is_revival` を真偽値に変換する（'true' / 'false' 以外は undefined）
 */
function parseIsRevival(raw: string | null): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

/**
 * URLクエリからフィルター条件を復元する
 *
 * 不正値（enum外・NaN・日付形式不正）はフィールド単位で捨てるため、
 * 1つ壊れていても他のフィルターは生き残る。
 *
 * @param searchParams - URLSearchParams
 * @returns 有効だったフィールドのみを含むフィルター条件
 */
export function parseFilterConditionsFromParams(
  searchParams: URLSearchParams,
): FilterConditions {
  const conditions: FilterConditions = {};

  const sortBy = parseField(
    'sort_by',
    searchParams.get(MOVIE_FILTER_QUERY_PARAMS.SORT_BY) ?? undefined,
  );
  if (sortBy) conditions.sort_by = sortBy;

  const releaseType = parseField(
    'release_type',
    searchParams.get(MOVIE_FILTER_QUERY_PARAMS.RELEASE_TYPE) ?? undefined,
  );
  if (releaseType) conditions.release_type = releaseType;

  const genreIds = parseField(
    'genre_ids',
    parseGenreIds(searchParams.get(MOVIE_FILTER_QUERY_PARAMS.GENRE_IDS)),
  );
  if (genreIds) conditions.genre_ids = genreIds;

  const dateGte = parseField(
    'date_range_gte',
    searchParams.get(MOVIE_FILTER_QUERY_PARAMS.DATE_RANGE_GTE) ?? undefined,
  );
  if (dateGte) conditions.date_range_gte = dateGte;

  const dateLte = parseField(
    'date_range_lte',
    searchParams.get(MOVIE_FILTER_QUERY_PARAMS.DATE_RANGE_LTE) ?? undefined,
  );
  if (dateLte) conditions.date_range_lte = dateLte;

  const isRevival = parseField(
    'is_revival',
    parseIsRevival(searchParams.get(MOVIE_FILTER_QUERY_PARAMS.IS_REVIVAL)),
  );
  if (isRevival !== undefined) conditions.is_revival = isRevival;

  return conditions;
}

/**
 * フィルター条件をURLクエリに反映する
 *
 * フィルター以外のクエリ（将来の追加分）は保持し、
 * 条件に含まれないフィルターキーは削除する。
 *
 * @param currentParams - 現在のURLSearchParams
 * @param conditions - 反映するフィルター条件
 * @returns 更新後のURLSearchParams
 */
export function buildFilterSearchParams(
  currentParams: URLSearchParams,
  conditions: FilterConditions,
): URLSearchParams {
  const params = new URLSearchParams(currentParams.toString());

  const setOrDelete = (key: string, value: string | undefined) => {
    if (value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  };

  setOrDelete(MOVIE_FILTER_QUERY_PARAMS.SORT_BY, conditions.sort_by);
  setOrDelete(MOVIE_FILTER_QUERY_PARAMS.RELEASE_TYPE, conditions.release_type);
  setOrDelete(
    MOVIE_FILTER_QUERY_PARAMS.GENRE_IDS,
    conditions.genre_ids && conditions.genre_ids.length > 0
      ? conditions.genre_ids.join(',')
      : undefined,
  );
  setOrDelete(
    MOVIE_FILTER_QUERY_PARAMS.DATE_RANGE_GTE,
    conditions.date_range_gte,
  );
  setOrDelete(
    MOVIE_FILTER_QUERY_PARAMS.DATE_RANGE_LTE,
    conditions.date_range_lte,
  );
  setOrDelete(
    MOVIE_FILTER_QUERY_PARAMS.IS_REVIVAL,
    conditions.is_revival === undefined
      ? undefined
      : String(conditions.is_revival),
  );

  return params;
}
