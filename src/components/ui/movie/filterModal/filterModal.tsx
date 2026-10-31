/**
 * FilterModalコンポーネント
 * 映画をフィルタリングするモーダル
 */

'use client';

import { memo, useState, useCallback, useMemo } from 'react';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';
import {
  MODAL_TITLES,
  BUTTON_LABELS,
  FILTER_LABELS,
  WATCH_PROVIDERS,
  type WatchProviderOfferType,
} from '@/constants';
import type { RegionGroupKey } from '@/constants/movies';
import type { DateRange } from '@/features/movies/types';

import styles from './filterModal.module.scss';

/**
 * 地域フィルタの選択肢
 *
 * 既定ではすべて未選択＝非表示。APIは include_regions 未指定を
 * 「3グループすべて除外」として扱う
 */
const REGION_OPTIONS: { key: RegionGroupKey; label: string }[] = [
  { key: 'korea', label: FILTER_LABELS.REGION_KOREA },
  { key: 'chinese', label: FILTER_LABELS.REGION_CHINESE },
  { key: 'thai_indian', label: FILTER_LABELS.REGION_THAI_INDIAN },
];

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
  /** 公開種別。配信サービスの絞り込みは streaming でのみ意味を持つ */
  releaseType: 'theatrical' | 'streaming';
  /** 選択中の配信プロバイダーID */
  selectedWatchProviderIds: number[];
  /** 選択中の提供形態（空配列なら全形態） */
  selectedOfferTypes: WatchProviderOfferType[];
  /** 表示に含める地域グループ（空配列なら全地域を除外） */
  selectedRegions: RegionGroupKey[];
  /** 適用コールバック */
  onApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
    watchProviderIds: number[],
    offerTypes: WatchProviderOfferType[],
    regions: RegionGroupKey[],
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
  releaseType: 'theatrical' | 'streaming';
  selectedWatchProviderIds: number[];
  selectedOfferTypes: WatchProviderOfferType[];
  selectedRegions: RegionGroupKey[];
  onApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
    watchProviderIds: number[],
    offerTypes: WatchProviderOfferType[],
    regions: RegionGroupKey[],
  ) => void;
}>(function FilterModalContent({
  genres,
  selectedGenreIds,
  selectedDateRange,
  isRevivalFilter,
  releaseType,
  selectedWatchProviderIds,
  selectedOfferTypes,
  selectedRegions,
  onApply,
}) {
  const [tempSelectedIds, setTempSelectedIds] =
    useState<number[]>(selectedGenreIds);
  const [tempDateRange, setTempDateRange] =
    useState<DateRange>(selectedDateRange);
  const [tempIsRevival, setTempIsRevival] = useState<boolean | undefined>(
    isRevivalFilter,
  );
  const [tempWatchProviderIds, setTempWatchProviderIds] = useState<number[]>(
    selectedWatchProviderIds,
  );
  const [tempOfferTypes, setTempOfferTypes] =
    useState<WatchProviderOfferType[]>(selectedOfferTypes);
  const [tempRegions, setTempRegions] =
    useState<RegionGroupKey[]>(selectedRegions);

  // 配信サービスは movie_cache の streaming 行にしか入らない。劇場公開タブで
  // 出しても必ず0件になるため、選べないようにする
  const showWatchProviders = releaseType === 'streaming';

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

  const handleWatchProviderToggle = useCallback((providerId: number) => {
    setTempWatchProviderIds((prev) =>
      prev.includes(providerId)
        ? prev.filter((id) => id !== providerId)
        : [...prev, providerId],
    );
  }, []);

  const handleOfferTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // 「すべて」は空配列で表す（APIは未指定を全形態として扱う）
      if (value === 'all') setTempOfferTypes([]);
      else if (value === 'flatrate') setTempOfferTypes(['flatrate']);
      else setTempOfferTypes(['rent', 'buy']);
    },
    [],
  );

  const handleRegionToggle = useCallback((key: RegionGroupKey) => {
    setTempRegions((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key],
    );
  }, []);

  const handleClear = useCallback(() => {
    setTempSelectedIds([]);
    setTempDateRange({});
    setTempIsRevival(undefined);
    setTempWatchProviderIds([]);
    setTempOfferTypes([]);
    setTempRegions([]);
  }, []);

  const handleApply = useCallback(() => {
    onApply(
      tempSelectedIds,
      tempDateRange,
      tempIsRevival,
      showWatchProviders ? tempWatchProviderIds : [],
      showWatchProviders ? tempOfferTypes : [],
      tempRegions,
    );
  }, [
    onApply,
    tempSelectedIds,
    tempDateRange,
    tempIsRevival,
    tempWatchProviderIds,
    tempOfferTypes,
    tempRegions,
    showWatchProviders,
  ]);

  return (
    <>
      <ModalBody>
        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>
            {FILTER_LABELS.RELEASE_DATE}
          </h3>
          <div className={styles.c_filter__date_range}>
            <label className={styles.c_filter__date_field}>
              <span className={styles.c_filter__date_label}>
                {FILTER_LABELS.DATE_FROM}
              </span>
              <input
                type='date'
                value={tempDateRange.gte || ''}
                onChange={handleDateGteChange}
                className={styles.c_filter__date_input}
              />
            </label>
            <span className={styles.c_filter__date_separator}>〜</span>
            <label className={styles.c_filter__date_field}>
              <span className={styles.c_filter__date_label}>
                {FILTER_LABELS.DATE_TO}
              </span>
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
          <h3 className={styles.c_filter__section_title}>
            {FILTER_LABELS.REVIVAL}
          </h3>
          <fieldset className={styles.c_filter__revival}>
            <legend className={styles.c_filter__visually_hidden}>
              {FILTER_LABELS.REVIVAL_FILTER}
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
              <span className={styles.c_filter__label}>
                {FILTER_LABELS.ALL}
              </span>
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
              <span className={styles.c_filter__label}>
                {FILTER_LABELS.REVIVAL_ONLY}
              </span>
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
              <span className={styles.c_filter__label}>
                {FILTER_LABELS.REVIVAL_EXCLUDE}
              </span>
            </label>
          </fieldset>
        </div>

        {showWatchProviders && (
          <div className={styles.c_filter__section}>
            <h3 className={styles.c_filter__section_title}>
              {FILTER_LABELS.WATCH_PROVIDER}
            </h3>
            <fieldset className={styles.c_filter__revival}>
              <legend className={styles.c_filter__visually_hidden}>
                {FILTER_LABELS.OFFER_TYPE_FILTER}
              </legend>
              <label className={styles.c_filter__radio_item}>
                <input
                  type='radio'
                  name='offerType'
                  value='all'
                  checked={tempOfferTypes.length === 0}
                  onChange={handleOfferTypeChange}
                  className={styles.c_filter__radio}
                />
                <span className={styles.c_filter__label}>
                  {FILTER_LABELS.ALL}
                </span>
              </label>
              <label className={styles.c_filter__radio_item}>
                <input
                  type='radio'
                  name='offerType'
                  value='flatrate'
                  checked={
                    tempOfferTypes.length === 1 &&
                    tempOfferTypes[0] === 'flatrate'
                  }
                  onChange={handleOfferTypeChange}
                  className={styles.c_filter__radio}
                />
                <span className={styles.c_filter__label}>
                  {FILTER_LABELS.OFFER_TYPE_FLATRATE}
                </span>
              </label>
              <label className={styles.c_filter__radio_item}>
                <input
                  type='radio'
                  name='offerType'
                  value='paid'
                  checked={tempOfferTypes.length === 2}
                  onChange={handleOfferTypeChange}
                  className={styles.c_filter__radio}
                />
                <span className={styles.c_filter__label}>
                  {FILTER_LABELS.OFFER_TYPE_PAID}
                </span>
              </label>
            </fieldset>
            <div className={styles.c_filter__tag_grid}>
              {WATCH_PROVIDERS.map((provider) => (
                <label key={provider.id} className={styles.c_filter__tag}>
                  <input
                    type='checkbox'
                    checked={tempWatchProviderIds.includes(provider.id)}
                    onChange={() => handleWatchProviderToggle(provider.id)}
                    className={styles.c_filter__tag_input}
                  />
                  <span className={styles.c_filter__tag_label}>
                    {provider.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>
            {FILTER_LABELS.REGION}
          </h3>
          <fieldset className={styles.c_filter__tag_grid}>
            <legend className={styles.c_filter__visually_hidden}>
              {FILTER_LABELS.REGION_FILTER}
            </legend>
            {REGION_OPTIONS.map((option) => (
              <label key={option.key} className={styles.c_filter__tag}>
                <input
                  type='checkbox'
                  checked={tempRegions.includes(option.key)}
                  onChange={() => handleRegionToggle(option.key)}
                  className={styles.c_filter__tag_input}
                />
                <span className={styles.c_filter__tag_label}>
                  {option.label}
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className={styles.c_filter__section}>
          <h3 className={styles.c_filter__section_title}>
            {FILTER_LABELS.GENRE}
          </h3>
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
            {BUTTON_LABELS.CLEAR}
          </Button>
          <Button variant='primary' size='sm' onClick={handleApply}>
            {BUTTON_LABELS.APPLY}
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
  releaseType,
  selectedWatchProviderIds,
  selectedOfferTypes,
  selectedRegions,
  onApply,
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={MODAL_TITLES.FILTER}
      size='sm'
      className={styles.c_filter__modal}
    >
      {open && (
        <FilterModalContent
          genres={genres}
          selectedGenreIds={selectedGenreIds}
          selectedDateRange={selectedDateRange}
          isRevivalFilter={isRevivalFilter}
          releaseType={releaseType}
          selectedWatchProviderIds={selectedWatchProviderIds}
          selectedOfferTypes={selectedOfferTypes}
          selectedRegions={selectedRegions}
          onApply={onApply}
        />
      )}
    </Modal>
  );
});

FilterModal.displayName = 'FilterModal';
