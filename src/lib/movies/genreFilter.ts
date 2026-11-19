/**
 * ジャンル一覧のフィルタ
 */

import { EXCLUDED_GENRE_IDS, GENRE_NAME_OVERRIDES } from '@/constants';

/**
 * 絞り込みの選択肢として提示してよいジャンルだけを残す
 *
 * `EXCLUDED_GENRE_IDS` のジャンルは保存前フィルタ
 * （`excludeInappropriateMovies`）で弾いているため、選択しても結果が
 * 返らない。TMDbのジャンル一覧をそのまま出すと、選べるのに必ず0件になる
 * 選択肢が利用者に見えてしまう。
 *
 * @param genres - TMDbから取得したジャンル一覧
 * @returns 除外ジャンルを取り除いた一覧
 */
export function toSelectableGenres<T extends { id: number }>(genres: T[]): T[] {
  const excludedIds: readonly number[] = EXCLUDED_GENRE_IDS;
  return genres.filter((genre) => !excludedIds.includes(genre.id));
}

/**
 * TMDbのジャンル一覧を、画面に出せる形に整える
 *
 * 「選択肢から除外ジャンルを落とす」と「表示名を置き換える」は、
 * `/api/movies`（ジャンル名マップ）と `/api/movies/genres`（選択肢）で
 * 同じ処理を別々に書いていた（#1278）。片方だけ直すと名前がずれるので
 * 1箇所にまとめる。
 *
 * @param genres - TMDbから取得したジャンル一覧
 * @returns 除外ジャンルを取り除き、表示名を置き換えた一覧
 */
export function toDisplayGenres<T extends { id: number; name: string }>(
  genres: T[],
): T[] {
  return toSelectableGenres(genres).map((genre) => ({
    ...genre,
    name: GENRE_NAME_OVERRIDES[genre.name] ?? genre.name,
  }));
}

/**
 * 除外対象のジャンルを含むかを判定する
 *
 * TMDbは公開後にジャンルを追加することがあり、保存時点では除外対象で
 * なかった作品が後から該当するようになる。保存前フィルタは一度しか
 * 効かないため、更新経路で再判定するのに使う。
 *
 * @param genreIds - 判定対象のジャンルID
 * @returns 除外対象を含む場合 true
 */
export function hasExcludedGenre(genreIds: number[]): boolean {
  const excludedIds: readonly number[] = EXCLUDED_GENRE_IDS;
  return genreIds.some((id) => excludedIds.includes(id));
}
