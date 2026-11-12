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
 *
 * ## リバイバル上映を別途判定しない理由（実測で確認済み）
 *
 * 一覧カードが持つ `release_date` は「日本での再上映日」なので未来になるが、
 * **映画詳細（`/api/movies/<id>`）が返すのは元の公開日**で、過去日になる。
 * そのため `is_revival` を見なくてもそのまま公開済みと判定される。
 *
 * | 作品 | 一覧の release_date | 詳細の release_date |
 * | --- | --- | --- |
 * | アメリ (194) | 2026-11-13 | 2001-04-25 |
 * | 南極料理人 (106378) | 2026-11-13 | 2009-08-08 |
 * | デスペア 光明への旅 (42203) | 2026-11-13 | 1978-09-20 |
 *
 * `tmdbClient` は全リクエストに `region=JP` を付けるが（`src/lib/tmdb/tmdb.ts`）、
 * それが効くのは `release_dates` の抽出であって `release_date` 本体ではない。
 *
 * ## 公開日が無い場合
 *
 * 判定材料が無いので出さない（false）。`isMovieReleased` は「未公開である
 * 確証が無いなら公開済み扱い」にするが、ここで守りたいのは**未確定の数字を
 * 出さない**ことなので、その判定は引き継がない。
 *
 * ⚠️ モーダル時代（`useMovieListContent`）は `release_date` が無くても
 * `is_revival === true` なら表示していた。詳細データに `is_revival` は無く、
 * かつ上記のとおりリバイバルは詳細の公開日が入るので、この分岐は実際には
 * 到達しない。
 *
 * 呼び出し側と同じクエリキーを見るだけなので、追加の通信は発生しない
 * （React Query が同一キーの購読を共有する）。
 *
 * @param movieId - 映画ID。モーダルを開いていなければ null
 * @returns 表示してよければ true。取得前・未選択なら false
 */
export function useShowFinancialInfo(movieId: number | null): boolean {
  const { movie } = useMovieDetail(movieId);
  const releaseDate = movie?.release_date ?? null;

  return useMemo(() => {
    if (!releaseDate) return false;
    return isMovieReleased(releaseDate, new Date());
  }, [releaseDate]);
}
