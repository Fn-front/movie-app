import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { APP_NAME, DISPLAY_LIMITS } from '@/constants';
import { MovieDetailPage } from '@/features/movies/component/movieDetailPage/movieDetailPage';
import { getCachedMovieDetail } from '@/lib/api/movies/movies.server';
import { parseMovieId } from '@/lib/movies/movieId';
import type { MovieDetail } from '@/lib/types';
import { getTMDbPosterUrl } from '@/utils/image';

type MovieDetailPageProps = {
  params: Promise<{ id: string }>;
};

/** OG の description に載せるあらすじの最大文字数 */
const OG_DESCRIPTION_MAX_CHARS = 120;

/**
 * 表示してよい映画を取得する
 *
 * ID書式・TMDbの404・アダルト作品を全て「存在しない」として扱う。
 * `getCachedMovieDetail` は generateMetadata とページ本体で共有しており、
 * 同じ映画への TMDb リクエストは1回で済む。
 *
 * @returns 映画詳細。表示対象でなければ null
 */
async function findVisibleMovie(id: string): Promise<MovieDetail | null> {
  const movieId = parseMovieId(id);
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

export async function generateMetadata({
  params,
}: MovieDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const movie = await findVisibleMovie(id);

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
    ? movie.overview.slice(0, OG_DESCRIPTION_MAX_CHARS)
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
 * 映画詳細ページ
 *
 * 直接アクセス・リロード・共有リンクで開かれる全画面表示。一覧からの
 * ソフト遷移では `src/app/@modal/(.)movies/detail/[id]/page.tsx` が割り込み、
 * 同じURLのままモーダルで出る（#1033）。
 */
export default async function MovieDetail({ params }: MovieDetailPageProps) {
  const { id } = await params;
  const movie = await findVisibleMovie(id);

  if (!movie) {
    notFound();
  }

  return <MovieDetailPage movieId={movie.id} />;
}
