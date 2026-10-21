/**
 * ライブ・コンサート映像作品の判定
 */

import {
  CONCERT_FILM_CANDIDATE_GENRE_IDS,
  CONCERT_KEYWORD_IDS,
  CONCERT_TITLE_PHRASES,
  CONCERT_TITLE_WORDS,
  MUSIC_GENRE_ID,
} from '@/constants';
import { getMovieKeywordIds } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';

/**
 * タイトル語の単語境界パターン（モジュール初期化時に1度だけ構築）
 */
const CONCERT_TITLE_WORD_PATTERN = new RegExp(
  `\\b(${CONCERT_TITLE_WORDS.join('|')})\\b`,
);

/**
 * ライブ興行作品の候補かを判定する
 *
 * ジャンルが Music 単体か Music + Documentary の作品だけを候補とする。
 * 候補を絞ることで、キーワード問い合わせ（TMDb APIコール）が必要な作品を
 * 一覧全体のごく一部に限定できる。
 *
 * @param movie - 判定対象の映画
 * @returns 候補なら true
 */
export function isConcertFilmCandidate(movie: Movie): boolean {
  const genreIds = movie.genre_ids ?? [];
  if (!genreIds.includes(MUSIC_GENRE_ID)) return false;

  const candidateGenres: readonly number[] = CONCERT_FILM_CANDIDATE_GENRE_IDS;
  return genreIds.every((id) => candidateGenres.includes(id));
}

/**
 * タイトルがライブ興行を示すかを判定する
 *
 * @param title - 映画タイトル
 * @returns ライブ興行を示す語を含む場合 true
 */
export function hasConcertTitle(title: string): boolean {
  // 全角英字（ＬＩＶＥ）や半角カナ（ﾗｲﾌﾞ）を畳んでから判定する。
  // toUpperCase() は全角英字を半角にしないため、正規化しないと取りこぼす
  const upperTitle = title.normalize('NFKC').toUpperCase();

  const phrases: readonly string[] = CONCERT_TITLE_PHRASES;
  if (phrases.some((phrase) => upperTitle.includes(phrase))) return true;

  return CONCERT_TITLE_WORD_PATTERN.test(upperTitle);
}

/**
 * ライブ・コンサート映像作品かを判定する
 *
 * ライブビューイング・コンサート映像を一覧から除くための判定。
 * 音楽ドキュメンタリー映画はジャンル構成が同一のため、キーワードと
 * タイトルで区別する。
 *
 * 劇映画ジャンルが付く舞台・演劇の中継はここでは候補に入らない。
 * `isStageBroadcast` が担当する。
 *
 * キーワード問い合わせは候補（`isConcertFilmCandidate`）に限って行う。
 * タイトルで判定できた時点で問い合わせをスキップするため、実際にAPIを
 * 引くのは「Music系ジャンルのみ かつ タイトルに手がかりが無い」作品だけ。
 *
 * 問い合わせに失敗した場合は**除外しない**（fail-open）。アダルト判定
 * （`hasExcludedKeyword`）が fail-closed なのに対し方針を変えているのは、
 * ライブ映像の混入が一覧の見栄えの問題にとどまる一方、fail-closed にすると
 * TMDbの一時障害だけで音楽ドキュメンタリーまで保存されなくなるため。
 *
 * @param movie - 判定対象の映画
 * @param options - リクエストオプション（中断シグナル）
 * @returns ライブ興行作品なら true
 */
export async function isConcertFilm(
  movie: Movie,
  options?: { signal?: AbortSignal },
): Promise<boolean> {
  if (!isConcertFilmCandidate(movie)) return false;
  if (hasConcertTitle(movie.title)) return true;

  try {
    const keywordIds = await getMovieKeywordIds(movie.id, options);
    const concertKeywords: readonly number[] = CONCERT_KEYWORD_IDS;
    return keywordIds.some((id) => concertKeywords.includes(id));
  } catch {
    return false;
  }
}
