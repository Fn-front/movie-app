import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MovieDetailPage } from '@/features/movies/component/movieDetailPage/movieDetailPage';
import {
  buildMovieDetailMetadata,
  findVisibleMovie,
} from '@/lib/api/movies/movieDetailRoute';

type MovieDetailRouteProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: MovieDetailRouteProps): Promise<Metadata> {
  const { id } = await params;

  return buildMovieDetailMetadata(await findVisibleMovie(id));
}

/**
 * 映画詳細ページ
 *
 * 共有リンク・新しいタブ・クローラから開かれる全画面表示。一覧から
 * タイトルを押したときは遷移せず、一覧の URL に `?movie_id=<id>` を足して
 * モーダルで重ねる（#1033）。
 */
export default async function MovieDetailRoute({
  params,
}: MovieDetailRouteProps) {
  const { id } = await params;
  const movie = await findVisibleMovie(id);

  if (!movie) {
    notFound();
  }

  return <MovieDetailPage movieId={movie.id} />;
}
