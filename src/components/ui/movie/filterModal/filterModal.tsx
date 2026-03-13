/**
 * FilterModalコンポーネント
 * 映画をフィルタリングするモーダル
 */

'use client';

import { memo, useState, useCallback, useMemo } from 'react';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';
import type { DateRange } from '@/features/movies/types';

import styles from './filterModal.module.scss';

/**
 * FilterModalコンポーネントのプロパティ
 */
export interface FilterModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** モーダルの開閉変更コールバック */
  onOpenChange: (open: boolean) => void;
  /** ジャンルマップ */
  genres: Record<number, string>;
  /** 選択中のジャンルID */
  selectedGenreIds: number[];
  /** 日付範囲フィルタ */
  selectedDateRange: DateRange;
  /** リバイバルフィルタ */
  isRevivalFilter: boolean | undefined;
  /** 適用コールバック */
  onApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
  ) => void;
}

/**
 * モーダル内部コンテンツ（開くたびに再マウントされ、初期値がリセットされる）
 */
const FilterModalContent = memo<{
  genres: Record<number, string>;
  selectedGenreIds: number[];
  selectedDateRange: DateRange;
  isRevivalFilter: boolean | undefined;
  onApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
  ) => void;
}>(function FilterModalContent({
  genres,
  selectedGenreIds,
  selectedDateRange,
  isRevivalFilter,
  onApply,
}) {
  const [tempSelectedIds, setTempSelectedIds] =
    useState<number[]>(selectedGenreIds);
  const [tempDateRange, setTempDateRange] =
    useState<DateRange>(selectedDateRange);
  const [tempIsRevival, setTempIsRevival] = useState<boolean | undefined>(
    isRevivalFilter,
  );

  const sortedGenres = useMemo(() => {
    return Object.entries(genres)
      .map(([id, name]) => ({ id: Number(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [genres]);

  const handleToggle = useCallback((genreId: number) => {
    setTempSelectedIds((prev) =>
      prev.includes(genreId)
        ? prev.filter((id) => id !== genreId)
        : [...prev, genreId],
    );
  }, []);

  const handleDateGteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTempDateRange((prev) => ({
        ...prev,
        gte: e.target.value || undefined,
      }));
    },
    [],
  );

  const handleDateLteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTempDateRange((prev) => ({
        ...prev,
        lte: e.target.value || undefined,
      }));
    },
    [],
  );

  const handleRevivalChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === 'all') setTempIsRevival(undefined);
      else if (value === 'true') setTempIsRevival(true);
      else setTempIsRevival(false);
    },
    [],
  );

  const handleClear = useCallback(() => {
    setTempSelectedIds([]);
    setTempDateRange({});
    setTempIsRevival(undefined);
  }, []);

  const handleApply = useCallback(() => {
    onApply(tempSelectedIds, tempDateRange, tempIsRevival);
  }, [onApply, tempSelectedIds, tempDateRange, tempIsRevival]);

  return (
    <>
      <ModalBody>
        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>公開日</h3>
          <div className={styles.c_filter__date_range}>
            <label className={styles.c_filter__date_field}>
              <span className={styles.c_filter__date_label}>開始日</span>
              <input
                type='date'
                value={tempDateRange.gte || ''}
                onChange={handleDateGteChange}
                className={styles.c_filter__date_input}
              />
            </label>
            <span className={styles.c_filter__date_separator}>〜</span>
            <label className={styles.c_filter__date_field}>
              <span className={styles.c_filter__date_label}>終了日</span>
              <input
                type='date'
                value={tempDateRange.lte || ''}
                onChange={handleDateLteChange}
                className={styles.c_filter__date_input}
              />
            </label>
          </div>
        </div>

        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>リバイバル上映</h3>
          <fieldset className={styles.c_filter__revival}>
            <legend className={styles.c_filter__visually_hidden}>
              リバイバル上映フィルタ
            </legend>
            <label className={styles.c_filter__radio_item}>
              <input
                type='radio'
                name='revival'
                value='all'
                checked={tempIsRevival === undefined}
                onChange={handleRevivalChange}
                className={styles.c_filter__radio}
              />
              <span className={styles.c_filter__label}>すべて</span>
            </label>
            <label className={styles.c_filter__radio_item}>
              <input
                type='radio'
                name='revival'
                value='true'
                checked={tempIsRevival === true}
                onChange={handleRevivalChange}
                className={styles.c_filter__radio}
              />
              <span className={styles.c_filter__label}>リバイバルのみ</span>
            </label>
            <label className={styles.c_filter__radio_item}>
              <input
                type='radio'
                name='revival'
                value='false'
                checked={tempIsRevival === false}
                onChange={handleRevivalChange}
                className={styles.c_filter__radio}
              />
              <span className={styles.c_filter__label}>リバイバル除外</span>
            </label>
          </fieldset>
        </div>

        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>ジャンル</h3>
          <div className={styles.c_filter__tag_grid}>
            {sortedGenres.map((genre) => (
              <label key={genre.id} className={styles.c_filter__tag}>
                <input
                  type='checkbox'
                  checked={tempSelectedIds.includes(genre.id)}
                  onChange={() => handleToggle(genre.id)}
                  className={styles.c_filter__tag_input}
                />
                <span className={styles.c_filter__tag_label}>{genre.name}</span>
              </label>
            ))}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className={styles.c_filter__footer}>
          <Button variant='ghost' size='sm' onClick={handleClear}>
            クリア
          </Button>
          <Button variant='primary' size='sm' onClick={handleApply}>
            適用
          </Button>
        </div>
      </ModalFooter>
    </>
  );
});

FilterModalContent.displayName = 'FilterModalContent';

/**
 * FilterModalコンポーネント
 */
export const FilterModal = memo<FilterModalProps>(function FilterModal({
  open,
  onOpenChange,
  genres,
  selectedGenreIds,
  selectedDateRange,
  isRevivalFilter,
  onApply,
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title='フィルター'
      size='sm'
      className={styles.c_filter__modal}
    >
      {open && (
        <FilterModalContent
          genres={genres}
          selectedGenreIds={selectedGenreIds}
          selectedDateRange={selectedDateRange}
          isRevivalFilter={isRevivalFilter}
          onApply={onApply}
        />
      )}
    </Modal>
  );
});

FilterModal.displayName = 'FilterModal';
