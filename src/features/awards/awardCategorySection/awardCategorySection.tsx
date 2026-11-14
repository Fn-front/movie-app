/**
 * 受賞作品 カテゴリセクションコンポーネント
 * 部門ごとの受賞映画・ノミネート映画を表示
 */

'use client';

import { memo, useMemo } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { useMovieViewMode } from '@/hooks/useMovieViewMode';
import { cn } from '@/utils/cn';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import type { AwardCategoryData } from '@/features/awards/types';
import { awardMovieToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './awardCategorySection.module.scss';

export interface AwardCategorySectionProps {
  category: AwardCategoryData;
  awardName: string;
  /** タイルのタイトルを修飾キーなしで押したとき（モーダルで開く） */
  onMovieSelect: (movieId: number) => void;
  isInWatchlist: (tmdbMovieId: number) => boolean;
  onWatchlistToggle: (movie: MovieCacheItem) => void;
  isMovieToggling: (tmdbMovieId: number) => boolean;
  onFavoriteToggle: (
    movie: MovieCacheItem,
    favorite: MovieFavoriteInfo | null,
  ) => void;
  isFavoriteProcessing: (tmdbMovieId: number) => boolean;
  /** 指定映画のお気に入り情報を取得（未登録ならnull） */
  getFavoriteInfo: (tmdbMovieId: number) => MovieFavoriteInfo | null;
  /** お気に入りの登録状況がまだ分からない（既定: false / #1135） */
  isFavoriteResolving?: boolean;
  /** ウォッチリストの登録状況がまだ分からない（#1145） */
  isWatchlistResolving?: boolean;
  /**
   * このセクションがページ先頭かどうか（既定: false）
   *
   * 先頭カテゴリの受賞作タイルだけがフォールド上に来るため、そこだけ
   * ポスターを即時読み込みする。2件目以降のカテゴリは遅延のままにする
   */
  isFirstSection?: boolean;
}

export const AwardCategorySection = memo<AwardCategorySectionProps>(
  function AwardCategorySection({
    category,
    awardName,
    onMovieSelect,
    isInWatchlist,
    onWatchlistToggle,
    isMovieToggling,
    onFavoriteToggle,
    isFavoriteProcessing,
    getFavoriteInfo,
    isFavoriteResolving = false,
    isWatchlistResolving = false,
    isFirstSection = false,
  }) {
    // 受賞作品APIはお気に入りを返さない（公開API＋共有キャッシュのため）。
    // ここでクライアント側のお気に入り情報と結合する。
    // getFavoriteInfo を依存に含めないと、お気に入りを操作しても
    // 再計算されずカードの表示が追従しない
    const { winners, nominees } = useMemo(() => {
      const entries = category.nominees.map((award) => ({
        /**
         * 行を一意に識別するキー
         *
         * 同じ作品から複数人がノミネートされるため、映画IDだけでは衝突する
         * （DBの一意キーも映画・部門・人名の組）
         */
        key: `${award.tmdbMovieId}:${award.personName ?? ''}`,
        award,
        movie: awardMovieToMovieCacheItem(
          award,
          getFavoriteInfo(award.tmdbMovieId),
        ),
      }));

      return {
        winners: entries.filter((e) => e.award.isWinner),
        nominees: entries.filter((e) => !e.award.isWinner),
      };
    }, [category.nominees, getFavoriteInfo]);

    const { viewMode } = useMovieViewMode();
    // 受賞・ノミネートは並びの定義を共有する（#987）。リストでも揃える
    const isList = viewMode === 'list';
    const tilesClassName = isList
      ? styles['c_award_category__tiles--list']
      : undefined;
    const itemClassName = isList
      ? styles['c_award_category__item--list']
      : undefined;

    // 一覧とラベルを紐づける。同点受賞で複数枚並ぶため、
    // 「受賞」ラベルの隣接だけでは2枚目以降が受賞だと伝わらない
    const sectionId = `category-${awardName}-${category.category}`;
    const winnerLabelId = `${sectionId}-winner-label`;
    const nomineeLabelId = `${sectionId}-nominee-label`;

    return (
      <div id={sectionId} className={styles.c_award_category}>
        <h3 className={styles.c_award_category__title}>{category.label}</h3>

        {winners.length > 0 && (
          <div className={styles.c_award_category__winner}>
            <span
              id={winnerLabelId}
              className={styles.c_award_category__winner_label}
            >
              受賞
            </span>
            <div
              className={cn(
                styles.c_award_category__winner_tiles,
                tilesClassName,
              )}
              role='list'
              aria-labelledby={winnerLabelId}
            >
              {winners.map(({ key, award, movie }) => (
                <div
                  key={key}
                  role='listitem'
                  className={cn(
                    styles.c_award_category__winner_tile,
                    itemClassName,
                  )}
                >
                  <MovieTile
                    movie={movie}
                    headingLevel={4}
                    onSelect={onMovieSelect}
                    eager={isFirstSection}
                    isInWatchlist={isInWatchlist(movie.id)}
                    onWatchlistToggle={onWatchlistToggle}
                    watchlistDisabled={isMovieToggling(movie.id)}
                    onFavoriteToggle={onFavoriteToggle}
                    favoriteDisabled={isFavoriteProcessing(movie.id)}
                    isFavoriteResolving={isFavoriteResolving}
                    isWatchlistResolving={isWatchlistResolving}
                    viewMode={viewMode}
                  />
                  {award.personName && (
                    <p className={styles.c_award_category__person_name}>
                      {award.personName}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {nominees.length > 0 && (
          <div className={styles.c_award_category__nominees}>
            <span
              id={nomineeLabelId}
              className={styles.c_award_category__nominees_label}
            >
              ノミネート
            </span>
            <div
              className={cn(styles.c_award_category__grid, tilesClassName)}
              role='list'
              aria-labelledby={nomineeLabelId}
            >
              {nominees.map(({ key, award, movie }) => (
                <div
                  key={key}
                  role='listitem'
                  className={cn(styles.c_award_category__item, itemClassName)}
                >
                  <MovieTile
                    movie={movie}
                    isInWatchlist={isInWatchlist(movie.id)}
                    headingLevel={4}
                    onSelect={onMovieSelect}
                    onWatchlistToggle={onWatchlistToggle}
                    watchlistDisabled={isMovieToggling(movie.id)}
                    onFavoriteToggle={onFavoriteToggle}
                    favoriteDisabled={isFavoriteProcessing(movie.id)}
                    isFavoriteResolving={isFavoriteResolving}
                    isWatchlistResolving={isWatchlistResolving}
                    viewMode={viewMode}
                  />
                  {award.personName && (
                    <p className={styles.c_award_category__person_name}>
                      {award.personName}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

AwardCategorySection.displayName = 'AwardCategorySection';
