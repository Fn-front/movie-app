/**
 * WatchlistCleanupModalコンポーネント
 * 追加年を指定して視聴済みをまとめて削除する確認モーダル
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';

import { Button } from '@/components/ui/button/button';
import { Checkbox } from '@/components/ui/checkbox/checkbox';
import { Loading } from '@/components/ui/loading/loading';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Select } from '@/components/ui/select/select';
import { IMAGE_SIZES, WATCHLIST_CLEANUP_LABELS } from '@/constants';
import { useWatchlistCleanup } from '@/features/watchlist/hooks/useWatchlistCleanup';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';
import { formatDate } from '@/utils/date';
import { getTMDbImageUrl } from '@/utils/image';

import styles from './watchlistCleanupModal.module.scss';

/**
 * WatchlistCleanupModalコンポーネントのプロパティ
 */
export interface WatchlistCleanupModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** 開閉状態の変更 */
  onOpenChange: (open: boolean) => void;
}

/**
 * WatchlistCleanupModalコンポーネント
 */
export const WatchlistCleanupModal = memo<WatchlistCleanupModalProps>(
  function WatchlistCleanupModal({ open, onOpenChange }) {
    const handleDeleted = useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    const {
      years,
      isYearsLoading,
      selectedYear,
      handleYearChange,
      items,
      isItemsLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      selectedCount,
      isSelected,
      toggleItem,
      isAllSelected,
      toggleAll,
      handleDelete,
      isDeleting,
    } = useWatchlistCleanup({ enabled: open, onDeleted: handleDeleted });

    const yearOptions = useMemo(
      () =>
        years.map((entry) => ({
          label: WATCHLIST_CLEANUP_LABELS.yearOption(entry.year, entry.count),
          value: String(entry.year),
        })),
      [years],
    );

    const handleCancel = useCallback(() => {
      onOpenChange(false);
    }, [onOpenChange]);

    const sentinelRef = useIntersectionObserver(fetchNextPage, {
      enabled: hasNextPage && !isFetchingNextPage,
      rootMargin: '100px',
    });

    const hasYears = years.length > 0;

    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={WATCHLIST_CLEANUP_LABELS.MODAL_TITLE}
        size='lg'
      >
        {isYearsLoading ? (
          <ModalBody>
            <div className={styles.c_watchlist_cleanup__loading}>
              <Loading size='sm' />
            </div>
          </ModalBody>
        ) : !hasYears ? (
          <ModalBody>
            <p className={styles.c_watchlist_cleanup__empty}>
              {WATCHLIST_CLEANUP_LABELS.EMPTY}
            </p>
          </ModalBody>
        ) : (
          <>
            <ModalBody>
              <div className={styles.c_watchlist_cleanup}>
                <div className={styles.c_watchlist_cleanup__header}>
                  <Select
                    options={yearOptions}
                    value={
                      selectedYear === null ? undefined : String(selectedYear)
                    }
                    onValueChange={handleYearChange}
                    aria-label={WATCHLIST_CLEANUP_LABELS.YEAR_LABEL}
                    disabled={isDeleting}
                  />
                  <div className={styles.c_watchlist_cleanup__select_all}>
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleAll}
                      disabled={isAllSelected || isDeleting}
                      label={WATCHLIST_CLEANUP_LABELS.SELECT_ALL}
                    />
                    <span className={styles.c_watchlist_cleanup__count}>
                      {WATCHLIST_CLEANUP_LABELS.selectedCount(selectedCount)}
                    </span>
                  </div>
                </div>

                {isItemsLoading ? (
                  <div className={styles.c_watchlist_cleanup__loading}>
                    <Loading size='sm' />
                  </div>
                ) : (
                  <ul className={styles.c_watchlist_cleanup__list}>
                    {items.map((item) => (
                      <CleanupRow
                        key={item.id}
                        item={item}
                        checked={isSelected(item.id)}
                        disabled={isDeleting}
                        onToggle={toggleItem}
                      />
                    ))}
                  </ul>
                )}

                {hasNextPage && (
                  <div
                    ref={sentinelRef}
                    className={styles.c_watchlist_cleanup__sentinel}
                  />
                )}

                {isFetchingNextPage && (
                  <div className={styles.c_watchlist_cleanup__loading}>
                    <Loading size='sm' />
                  </div>
                )}
              </div>
            </ModalBody>

            <ModalFooter>
              <Button
                variant='ghost'
                onClick={handleCancel}
                disabled={isDeleting}
              >
                {WATCHLIST_CLEANUP_LABELS.CANCEL}
              </Button>
              <Button
                variant='danger'
                onClick={handleDelete}
                disabled={selectedCount === 0 || isDeleting}
              >
                {WATCHLIST_CLEANUP_LABELS.deleteButton(selectedCount)}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    );
  },
);

WatchlistCleanupModal.displayName = 'WatchlistCleanupModal';

/**
 * CleanupRowコンポーネントのプロパティ
 */
interface CleanupRowProps {
  /** 対象アイテム */
  item: WatchlistItem;
  /** 削除対象として選択されているか */
  checked: boolean;
  /** 操作不可か */
  disabled: boolean;
  /** 選択の切り替え */
  onToggle: (id: string) => void;
}

/**
 * CleanupRowコンポーネント
 * 削除対象1件の行（チェックボックス + ポスター + タイトル + 追加日）
 */
const CleanupRow = memo<CleanupRowProps>(function CleanupRow({
  item,
  checked,
  disabled,
  onToggle,
}) {
  const handleToggle = useCallback(() => {
    onToggle(item.id);
  }, [onToggle, item.id]);

  const posterUrl = getTMDbImageUrl(item.poster_path, 'w92');

  return (
    <li className={styles.c_watchlist_cleanup__row}>
      <Checkbox
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled}
        aria-label={`${item.title}を削除対象にする`}
      />
      {posterUrl ? (
        // 同じ行にタイトルのテキストがあるため、読み上げの二重化を避けて
        // 装飾的な画像として扱う
        <Image
          className={styles.c_watchlist_cleanup__poster}
          src={posterUrl}
          alt=''
          width={IMAGE_SIZES.THUMBNAIL.WIDTH}
          height={IMAGE_SIZES.THUMBNAIL.HEIGHT}
        />
      ) : (
        <div
          className={styles.c_watchlist_cleanup__poster_fallback}
          aria-hidden='true'
        >
          🎬
        </div>
      )}
      <span className={styles.c_watchlist_cleanup__title}>{item.title}</span>
      <span className={styles.c_watchlist_cleanup__date}>
        {formatDate(item.added_at)}
      </span>
    </li>
  );
});

CleanupRow.displayName = 'CleanupRow';
