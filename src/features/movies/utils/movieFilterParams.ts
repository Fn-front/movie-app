/**
 * 一覧画面のフィルター状態の永続化（URLクエリ / localStorage）
 *
 * フィルターをURLに持たせることで、未認証ユーザーでもページ遷移後の
 * ブラウザバックで状態が復元され、URL共有も可能になる。
 * ただしサイドナビのリンクはクエリを持たないため、その経路の復元手段として
 * localStorage にも保存する。
 *
 * 復元時の値は外部入力（手打ちURL・古いブックマーク・改変されたストレージ）に
 * なりうるため、`filterConditionsSchema` を単一ソースとしてフィールド単位で検証し、
 * 不正値は黙ってデフォルトへフォールバックする（例外は投げない）。
 */

import { STORAGE_KEYS } from '@/constants/common';
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
 * ジャンルIDを数値配列に正規化する
 *
 * URLは `genre_ids=28,12` のカンマ区切り文字列、localStorage は配列で来る。
 *
 * @returns 有効なIDが1件以上あれば配列、無ければ undefined
 */
function normalizeGenreIds(raw: unknown): number[] | undefined {
  const values = typeof raw === 'string' ? raw.split(',') : raw;
  if (!Array.isArray(values)) return undefined;

  const ids = values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.length > 0 ? ids : undefined;
}

/**
 * リバイバルフラグを真偽値に正規化する
 *
 * URLは 'true' / 'false' の文字列、localStorage は真偽値で来る。
 */
function normalizeIsRevival(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

/** 検証前の生のフィルター値 */
interface RawFilterConditions {
  sort_by?: unknown;
  release_type?: unknown;
  genre_ids?: unknown;
  date_range_gte?: unknown;
  date_range_lte?: unknown;
  is_revival?: unknown;
}

/**
 * 生の値をフィールド単位で検証し、有効なものだけを残す
 *
 * URL・localStorage のどちらから来た値もこの関数を通すことで、
 * 検証ロジックを1箇所に保つ。
 */
function validateFilterConditions(raw: RawFilterConditions): FilterConditions {
  const conditions: FilterConditions = {};

  const sortBy = parseField('sort_by', raw.sort_by ?? undefined);
  if (sortBy) conditions.sort_by = sortBy;

  const releaseType = parseField('release_type', raw.release_type ?? undefined);
  if (releaseType) conditions.release_type = releaseType;

  const genreIds = parseField('genre_ids', normalizeGenreIds(raw.genre_ids));
  if (genreIds) conditions.genre_ids = genreIds;

  const dateGte = parseField('date_range_gte', raw.date_range_gte ?? undefined);
  if (dateGte) conditions.date_range_gte = dateGte;

  const dateLte = parseField('date_range_lte', raw.date_range_lte ?? undefined);
  if (dateLte) conditions.date_range_lte = dateLte;

  const isRevival = parseField(
    'is_revival',
    normalizeIsRevival(raw.is_revival),
  );
  if (isRevival !== undefined) conditions.is_revival = isRevival;

  return conditions;
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
  return validateFilterConditions({
    sort_by: searchParams.get(MOVIE_FILTER_QUERY_PARAMS.SORT_BY) ?? undefined,
    release_type:
      searchParams.get(MOVIE_FILTER_QUERY_PARAMS.RELEASE_TYPE) ?? undefined,
    genre_ids:
      searchParams.get(MOVIE_FILTER_QUERY_PARAMS.GENRE_IDS) ?? undefined,
    date_range_gte:
      searchParams.get(MOVIE_FILTER_QUERY_PARAMS.DATE_RANGE_GTE) ?? undefined,
    date_range_lte:
      searchParams.get(MOVIE_FILTER_QUERY_PARAMS.DATE_RANGE_LTE) ?? undefined,
    is_revival:
      searchParams.get(MOVIE_FILTER_QUERY_PARAMS.IS_REVIVAL) ?? undefined,
  });
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

/**
 * localStorage からフィルター条件を復元する
 *
 * サイドナビのリンクなどクエリを持たない経路で入ったときの復元手段。
 * SSR・localStorage 利用不可（プライベートブラウジング等）では空を返し、
 * 例外は投げない。
 *
 * @returns 有効だったフィールドのみを含むフィルター条件
 */
export function readStoredFilterConditions(): FilterConditions {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.MOVIE_FILTERS);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    return validateFilterConditions(parsed as RawFilterConditions);
  } catch (error) {
    console.error('Failed to read stored movie filters:', error);
    return {};
  }
}

/**
 * localStorage にフィルター条件を保存する
 *
 * localStorage 利用不可でも例外を投げない（URL / saved_filters で動作継続）。
 */
export function writeStoredFilterConditions(
  conditions: FilterConditions,
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STORAGE_KEYS.MOVIE_FILTERS,
      JSON.stringify(conditions),
    );
  } catch (error) {
    console.error('Failed to store movie filters:', error);
  }
}
