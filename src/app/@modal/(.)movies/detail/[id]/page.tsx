/**
 * 映画詳細の intercepting route
 *
 * 一覧から `/movies/detail/[id]` へ**ソフト遷移**したときだけ当たり、詳細を
 * モーダルで重ねる。直接アクセス・リロード・共有リンクでは当たらず、
 * `src/app/movies/detail/[id]/page.tsx` の全画面ページが出る（#1033）。
 *
 * `(.)` は**ルートセグメント**基準。`@modal` はスロットでセグメントに
 * 数えないため、ファイル階層が2つ深くてもルート直下の `movies` と同じ段になる。
 *
 * ⚠️ パスに `detail` を挟んでいるのは飾りではない。割り込みの一致は URL の形
 * だけで決まるので、`(.)movies/[id]` にすると `/movies/now-showing` や
 * `/movies/upcoming` まで横取りし、**一覧を表示したまま URL だけ変わる**
 * （children スロットが更新されない）。セグメント数で静的な一覧と区別する。
 */

import { MovieDetailRouteModal } from '@/features/movies/component/movieDetailRouteModal/movieDetailRouteModal';
import { parseMovieId } from '@/lib/movies/movieId';

type InterceptedMovieDetailProps = {
  params: Promise<{ id: string }>;
};

export default async function InterceptedMovieDetail({
  params,
}: InterceptedMovieDetailProps) {
  const { id } = await params;
  const movieId = parseMovieId(id);

  // 書式が不正なIDは 404 を出す側（children スロットのページ）に任せる。
  // ここで notFound() を呼ぶと、404 画面の上にモーダルの器だけが重なる
  if (movieId === null) {
    return null;
  }

  return <MovieDetailRouteModal movieId={movieId} />;
}
