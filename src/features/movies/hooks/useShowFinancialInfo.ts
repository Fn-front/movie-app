/**
 * 予算・興行収入を出してよいかを判定するフック
 */

import { useMemo } from 'react';

import { useMovieDetail } from '@/features/movies/hooks/useMovieDetail';
import { isMovieReleased } from '@/utils/movie';

/**
 * 予算・興行収入を表示してよいかを返す
 *
 * 公開前の作品では未確定の数字（0 や暫定値）が並ぶだけなので出さない。
 * リバイバル上映は別途判定しなくてよい。一覧カードが持つ `release_date` は
 * 「日本での再上映日」で未来になるが、**映画詳細が返すのは元の公開日**
 * なので、そのまま公開済みと判定される。
 *
 * 公開日が分からない作品も出さない。`isMovieReleased` は「未公開である確証が
 * 無いなら公開済み扱い」にするが、ここで守りたいのは**未確定の数字を出さない**
 * ことなので、判定を引き継がず false にする（モーダル時代と同じ扱い）。
 *
 * 呼び出し側と同じクエリキーを見るだけなので、追加の通信は発生しない
 * （React Query が同一キーの購読を共有する）。
 *
 * @param movieId - 映画ID
 * @returns 表示してよければ true。取得前は false
 */
export function useShowFinancialInfo(movieId: number): boolean {
  const { movie } = useMovieDetail(movieId);
  const releaseDate = movie?.release_date ?? null;

  return useMemo(() => {
    if (!releaseDate) return false;
    return isMovieReleased(releaseDate, new Date());
  }, [releaseDate]);
}
