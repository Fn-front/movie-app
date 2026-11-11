/**
 * 受賞作品ページ メインコンポーネント
 */

'use client';

import { memo, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { ViewModeToggle } from '@/components/ui/movie/viewModeToggle/viewModeToggle';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useMovieDetailModal } from '@/hooks/useMovieDetailModal';
import { AWARDS_MESSAGES } from '@/constants';
import { useAwards } from '@/features/awards/hooks/useAwards';
import { Tabs } from '@/components/ui/tabs/tabs';
import { AwardYearSelect } from '@/features/awards/awardYearSelect/awardYearSelect';
import { AwardSection } from '@/features/awards/awardSection/awardSection';
import { awardMovieToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './awardsPage.module.scss';

export const AwardsPage = memo(function AwardsPage() {
  // 管理画面の手動同期から「受賞作品ページで確認」で遷移したときだけ付く。
  // /api/awards は public キャッシュを返すため、これを中継しないと
  // 同期直後でもブラウザが古い結果を見せる（実測で transferSize=0 を確認）
  const searchParams = useSearchParams();
  const cacheBuster = searchParams.get('t') ?? undefined;

  const {
    data,
    isLoading,
    isError,
    selectedYear,
    handleYearChange,
    awardOptions,
    selectedAward,
    handleAwardChange,
  } = useAwards(cacheBuster);

  const {
    modalState: favoriteModalState,
    handleFavoriteToggle,
    closeModal: closeFavoriteModal,
    handleModalSubmit: handleFavoriteModalSubmit,
    handleDelete: handleFavoriteDelete,
    isFavoriteProcessing,
    getFavoriteInfo,
  } = useFavoriteToggle();

  const { isInWatchlist, toggleWatchlist, isMovieToggling } =
    useWatchlistToggle();

  const awards = data?.awards;

  // 詳細モーダルの一覧。お気に入りは結合しない。
  // 消費先（useMovieDetailModal）は id と title しか読まず、モーダル自体は
  // 映画詳細APIが返す favorite を使うため、ここで結合しても効果が無い。
  // 依存に getFavoriteInfo を足すと、お気に入り操作のたびに
  // 全受賞作の再マッピングが走るだけになる
  const allMovieCacheItems = useMemo(() => {
    if (!awards) return [];
    return awards.flatMap((award) =>
      award.categories.flatMap((cat) =>
        cat.nominees.map((nominee) => awardMovieToMovieCacheItem(nominee)),
      ),
    );
  }, [awards]);

  const uniqueMovieCacheItems = useMemo(() => {
    const seen = new Set<number>();
    return allMovieCacheItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [allMovieCacheItems]);

  const {
    selectedMovieId,
    selectedMovieTitle,
    handleMovieClick,
    handleModalClose,
  } = useMovieDetailModal(uniqueMovieCacheItems);

  if (isLoading) {
    return (
      <div className={styles.c_awards_page}>
        <div className={styles.c_awards_page__toolbar}>
          <h1 className={styles.c_awards_page__title}>
            {AWARDS_MESSAGES.PAGE_TITLE}
          </h1>
        </div>
        <div className={styles.c_awards_page__loading}>
          <Loading size='md' />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.c_awards_page}>
        <div className={styles.c_awards_page__toolbar}>
          <h1 className={styles.c_awards_page__title}>
            {AWARDS_MESSAGES.PAGE_TITLE}
          </h1>
        </div>
        <p className={styles.c_awards_page__message}>
          {AWARDS_MESSAGES.FETCH_ERROR}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.c_awards_page}>
        <div className={styles.c_awards_page__toolbar}>
          <h1 className={styles.c_awards_page__title}>
            {AWARDS_MESSAGES.PAGE_TITLE}
          </h1>
          {data && data.availableYears.length > 0 && (
            <div className={styles.c_awards_page__controls}>
              <ViewModeToggle />
              <AwardYearSelect
                availableYears={data.availableYears}
                selectedYear={selectedYear}
                onYearChange={handleYearChange}
                className={styles.c_awards_page__sort}
              />
            </div>
          )}
        </div>

        {selectedAward ? (
          <div className={styles.c_awards_page__content}>
            {/*
              賞は縦に連結せずタブで1つずつ出す。ポスターを並べると1部門が
              約900pxになり、3賞23部門を積むと約28画面ぶんになるため
            */}
            {awardOptions.length > 0 ? (
              <Tabs
                options={awardOptions}
                value={selectedAward.awardName}
                onValueChange={handleAwardChange}
                aria-label='賞を選択'
                contentClassName={styles.c_awards_page__tab_panel}
              >
                <AwardSection
                  award={selectedAward}
                  onMovieClick={handleMovieClick}
                  isInWatchlist={isInWatchlist}
                  onWatchlistToggle={toggleWatchlist}
                  isMovieToggling={isMovieToggling}
                  onFavoriteToggle={handleFavoriteToggle}
                  isFavoriteProcessing={isFavoriteProcessing}
                  getFavoriteInfo={getFavoriteInfo}
                  hideTitle
                />
              </Tabs>
            ) : (
              <AwardSection
                award={selectedAward}
                onMovieClick={handleMovieClick}
                isInWatchlist={isInWatchlist}
                onWatchlistToggle={toggleWatchlist}
                isMovieToggling={isMovieToggling}
                onFavoriteToggle={handleFavoriteToggle}
                isFavoriteProcessing={isFavoriteProcessing}
                getFavoriteInfo={getFavoriteInfo}
              />
            )}
          </div>
        ) : (
          <p className={styles.c_awards_page__message}>
            {AWARDS_MESSAGES.NO_DATA}
          </p>
        )}
      </div>
      <MovieDetailModal
        movieId={selectedMovieId}
        title={selectedMovieTitle}
        onClose={handleModalClose}
      />
      <FavoriteRatingModal
        isOpen={favoriteModalState.isOpen}
        onClose={closeFavoriteModal}
        movieTitle={favoriteModalState.movie?.title ?? ''}
        currentFavorite={favoriteModalState.currentFavorite}
        onSubmit={handleFavoriteModalSubmit}
        onDelete={handleFavoriteDelete}
      />
    </>
  );
});

AwardsPage.displayName = 'AwardsPage';
