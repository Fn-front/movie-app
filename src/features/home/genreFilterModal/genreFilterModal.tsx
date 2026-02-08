/**
 * GenreFilterModalコンポーネント
 * ジャンルで映画をフィルタリングするモーダル
 */

'use client';

import { memo, useState, useCallback, useMemo, useEffect } from 'react';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';

import styles from './genreFilterModal.module.scss';

/**
 * GenreFilterModalコンポーネントのプロパティ
 */
export interface GenreFilterModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** モーダルの開閉変更コールバック */
  onOpenChange: (open: boolean) => void;
  /** ジャンルマップ */
  genres: Record<number, string>;
  /** 選択中のジャンルID */
  selectedGenreIds: number[];
  /** 適用コールバック */
  onApply: (ids: number[]) => void;
}

/**
 * GenreFilterModalコンポーネント
 */
export const GenreFilterModal = memo<GenreFilterModalProps>(
  function GenreFilterModal({
    open,
    onOpenChange,
    genres,
    selectedGenreIds,
    onApply,
  }) {
    const [tempSelectedIds, setTempSelectedIds] =
      useState<number[]>(selectedGenreIds);

    useEffect(() => {
      if (open) {
        setTempSelectedIds(selectedGenreIds);
      }
    }, [open, selectedGenreIds]);

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

    const handleClear = useCallback(() => {
      setTempSelectedIds([]);
    }, []);

    const handleApply = useCallback(() => {
      onApply(tempSelectedIds);
    }, [onApply, tempSelectedIds]);

    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title='ジャンルで絞り込み'
        size='sm'
      >
        <ModalBody>
          <div className={styles.c_genre_filter__grid}>
            {sortedGenres.map((genre) => (
              <label
                key={genre.id}
                className={styles.c_genre_filter__item}
              >
                <input
                  type='checkbox'
                  checked={tempSelectedIds.includes(genre.id)}
                  onChange={() => handleToggle(genre.id)}
                  className={styles.c_genre_filter__checkbox}
                />
                <span className={styles.c_genre_filter__label}>
                  {genre.name}
                </span>
              </label>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <div className={styles.c_genre_filter__footer}>
            <Button variant='ghost' size='sm' onClick={handleClear}>
              クリア
            </Button>
            <Button variant='primary' size='sm' onClick={handleApply}>
              適用
            </Button>
          </div>
        </ModalFooter>
      </Modal>
    );
  },
);

GenreFilterModal.displayName = 'GenreFilterModal';
