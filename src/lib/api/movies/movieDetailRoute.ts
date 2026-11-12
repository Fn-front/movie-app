/**
 * 映画詳細ルートの共有ロジック
 *
 * 全画面ページ（`app/movies/[id]`）の `generateMetadata` と本体で共有する。
 * 同じ映画を2回引かないようにするためのまとめ。
 */

import type { Metadata } from 'next';

import { APP_NAME, DISPLAY_LIMITS } from '@/constants';
import { getCachedMovieDetail } from '@/lib/api/movies/movies.server';
import { parsePositiveIntId } from '@/lib/routeId';
import type { MovieDetail } from '@/lib/types';
import { getTMDbPosterUrl } from '@/utils/image';

/**
 * OG の description に載せるあらすじの最大文字数（省略記号を除く）
 */
const OG_DESCRIPTION_MAX_CHARS = 120;

/**
 * 表示してよい映画を取得する
 *
 * ID書式・TMDbの404・アダルト作品を全て「存在しない」として扱う。
 * `getCachedMovieDetail` を通すので、`generateMetadata`・ページ本体・
 * 割り込みのモーダルが同じ映画を見ても TMDb へのリクエストは1回で済む。
 *
 * @param id - URL から受け取った文字列
 * @returns 映画詳細。表示対象でなければ null
 */
export async function findVisibleMovie(
  id: string,
): Promise<MovieDetail | null> {
  const movieId = parsePositiveIntId(id);
  if (movieId === null) return null;

  try {
    const movie = await getCachedMovieDetail(movieId);
    // TMDb の include_adult は /search と /discover にしか効かないため自前で弾く
    return movie.adult ? null : movie;
  } catch {
    // TMDbの404も一時障害も、ページとしては出せないので同じ扱いにする
    return null;
  }
}

/**
 * 映画詳細の `<title>` と OG を組み立てる
 *
 * モーダルで開いているときも同じものを使う。URL を持たせた目的が共有と
 * ブックマークなので、**器がモーダルかページかでタイトルが変わってはいけない**。
 *
 * @param movie - 表示対象の映画。null なら未検出用のタイトルだけ返す
 */
export function buildMovieDetailMetadata(movie: MovieDetail | null): Metadata {
  if (!movie) {
    return { title: `映画が見つかりません | ${APP_NAME}` };
  }

  const title = `${movie.title} | ${APP_NAME}`;
  const genreNames = movie.genres
    .slice(0, DISPLAY_LIMITS.GENRE_MAX)
    .map((genre) => genre.name)
    .join('、');

  // あらすじが無い作品も多い（邦題未登録の洋画など）。その場合は
  // ジャンルと公開日で最低限の説明を組み立てる
  const description = movie.overview
    ? truncate(movie.overview, OG_DESCRIPTION_MAX_CHARS)
    : [movie.title, genreNames, movie.release_date].filter(Boolean).join(' / ');

  const posterUrl = getTMDbPosterUrl(movie.poster_path);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'video.movie',
      ...(posterUrl ? { images: [posterUrl] } : {}),
    },
  };
}

/**
 * 文中で切れたことが分かるように省略記号を足して切り詰める
 *
 * 単に `slice` すると OG の説明が文の途中でぶつ切りになり、続きがあるのか
 * そこで終わりなのかが読み手に伝わらない。
 */
function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`;
}
