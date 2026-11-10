/**
 * FilterModalコンポーネント
 * 映画をフィルタリングするモーダル
 */

'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';

import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal/modal';
import { Button } from '@/components/ui/button/button';
import {
  MODAL_TITLES,
  BUTTON_LABELS,
  FILTER_LABELS,
  WATCH_PROVIDERS,
  QUERY_PARAMS,
  type WatchProviderOfferType,
} from '@/constants';
import { RELEASE_TYPE, type RegionGroupKey } from '@/constants/movies';
import {
  getDateFilterBounds,
  isWithinDateFilterBounds,
} from '@/features/movies/dateFilterBounds';
import type { DateRange } from '@/features/movies/types';

import styles from './filterModal.module.scss';

/** 公開日の説明文のID（`aria-describedby` から参照する） */
const DATE_HINT_ID = 'filter-date-range-hint';

/** 公開日のエラー文のID */
const DATE_ERROR_ID = 'filter-date-range-error';

/**
 * タブごとの「なぜこの範囲なのか」の説明
 *
 * 配信 × 配信予定は制約を付けられないため説明も出さない
 * （`getDateFilterBounds` の JSDoc 参照）
 */
function getDateRangeHint(
  releaseType: 'theatrical' | 'streaming',
  timeFrame: 'upcoming' | 'now_showing',
): string | null {
  if (releaseType === RELEASE_TYPE.THEATRICAL) {
    return timeFrame === 'upcoming'
      ? FILTER_LABELS.DATE_RANGE_HINT.THEATRICAL_UPCOMING
      : FILTER_LABELS.DATE_RANGE_HINT.THEATRICAL_NOW_SHOWING;
  }

  return timeFrame === 'now_showing'
    ? FILTER_LABELS.DATE_RANGE_HINT.STREAMING_NOW_SHOWING
    : null;
}

/**
 * 過去作品の探し方を出すか（#996）
 *
 * **過去日を選べなくしたタブにだけ**出す。劇場×公開中は過去日が正しい
 * 用途（ロングラン・リバイバル）なので出すと的外れになる。
 * 配信×配信予定はそもそも制限していない。
 */
function showsPastMoviesGuide(
  releaseType: 'theatrical' | 'streaming',
  timeFrame: 'upcoming' | 'now_showing',
): boolean {
  if (releaseType === RELEASE_TYPE.THEATRICAL) return timeFrame === 'upcoming';

  return timeFrame === 'now_showing';
}

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
  /**
   * 時間軸。公開日で選べる範囲がこれと releaseType の組で変わる（#994）
   *
   * 任意にすると渡し漏れを TypeScript で検知できないため必須にする
   */
  timeFrame: 'upcoming' | 'now_showing';
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
  timeFrame: 'upcoming' | 'now_showing';
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
  timeFrame,
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
  /** 適用を拒んだ理由。null なら問題なし */
  const [dateError, setDateError] = useState<string | null>(null);

  // 配信サービスは movie_cache の streaming 行にしか入らない。劇場公開タブで
  // 出しても必ず0件になるため、選べないようにする
  const showWatchProviders = releaseType === 'streaming';

  // モーダルは開くたびに再マウントされるので、ここで new Date() を読んでも
  // 開いている間に日付が変わらない限り値は動かない。SSR でも描画されない
  // （`{open && ...}` でマウントされる）のでハイドレーション不一致も起きない
  const dateBounds = useMemo(
    () => getDateFilterBounds({ releaseType, timeFrame }),
    [releaseType, timeFrame],
  );

  const dateRangeHint = useMemo(
    () => getDateRangeHint(releaseType, timeFrame),
    [releaseType, timeFrame],
  );

  const pastMoviesGuide = showsPastMoviesGuide(releaseType, timeFrame);

  // 検索は公開年だけでも成立する（`hasSearchCriteria` に year が入っており、
  // キーワード未入力でも検索が走る）。既定を今年にしておけば開いた直後から
  // 結果が出る。`/search` は searchBar / titleSuggestion と同じくリテラル
  const pastMoviesSearchHref = `/search?${QUERY_PARAMS.YEAR}=${new Date().getFullYear()}`;

  // 開始日と終了日を相互に連動させる。gte > lte をピッカーの時点で防ぐ
  const gteMax = useMemo(() => {
    if (tempDateRange.lte === undefined) return dateBounds.max;
    if (dateBounds.max === undefined) return tempDateRange.lte;
    return tempDateRange.lte < dateBounds.max
      ? tempDateRange.lte
      : dateBounds.max;
  }, [tempDateRange.lte, dateBounds.max]);

  const lteMin = useMemo(() => {
    if (tempDateRange.gte === undefined) return dateBounds.min;
    if (dateBounds.min === undefined) return tempDateRange.gte;
    return tempDateRange.gte > dateBounds.min
      ? tempDateRange.gte
      : dateBounds.min;
  }, [tempDateRange.gte, dateBounds.min]);

  // 2つの入力から同じ説明・同じエラーを参照する。
  // モーダルは同時に1つしか開かないので固定IDで衝突しない
  const dateDescriptionIds =
    [dateRangeHint ? DATE_HINT_ID : null, dateError ? DATE_ERROR_ID : null]
      .filter(Boolean)
      .join(' ') || undefined;

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
      // 入力し直したら前回のエラーは消す。直したのに赤いまま、を避ける
      setDateError(null);
      setTempDateRange((prev) => ({
        ...prev,
        gte: e.target.value || undefined,
      }));
    },
    [],
  );

  const handleDateLteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDateError(null);
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
    setDateError(null);
  }, []);

  const handleApply = useCallback(() => {
    // min / max はピッカーを制限するだけで、手入力された値は強制されない。
    // 2つの入力は <form> の外にあり「適用」も素の <button> なので、
    // :invalid も submit のブロックも効かない（#994）
    const outOfRange =
      !isWithinDateFilterBounds(tempDateRange.gte, dateBounds) ||
      !isWithinDateFilterBounds(tempDateRange.lte, dateBounds);

    if (outOfRange) {
      setDateError(FILTER_LABELS.DATE_OUT_OF_RANGE);
      return;
    }

    const reversed =
      tempDateRange.gte !== undefined &&
      tempDateRange.lte !== undefined &&
      tempDateRange.gte > tempDateRange.lte;

    if (reversed) {
      setDateError(FILTER_LABELS.DATE_RANGE_REVERSED);
      return;
    }

    setDateError(null);
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
    dateBounds,
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
                min={dateBounds.min}
                max={gteMax}
                aria-describedby={dateDescriptionIds}
                aria-invalid={dateError !== null || undefined}
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
                min={lteMin}
                max={dateBounds.max}
                aria-describedby={dateDescriptionIds}
                aria-invalid={dateError !== null || undefined}
                className={styles.c_filter__date_input}
              />
            </label>
          </div>
          {dateRangeHint && (
            <p id={DATE_HINT_ID} className={styles.c_filter__date_hint}>
              {dateRangeHint}
              {/* 過去日を選べなくしたタブにだけ、ではどこで探せるのかを示す（#996） */}
              {pastMoviesGuide && (
                <>
                  {FILTER_LABELS.PAST_MOVIES_GUIDE}
                  {/* 遷移でページごと差し替わるため、モーダルを閉じる処理は要らない */}
                  <Link
                    href={pastMoviesSearchHref}
                    className={styles.c_filter__date_hint_link}
                  >
                    {FILTER_LABELS.PAST_MOVIES_LINK}
                  </Link>
                </>
              )}
            </p>
          )}
          {dateError && (
            <p
              id={DATE_ERROR_ID}
              role='alert'
              className={styles.c_filter__date_error}
            >
              {dateError}
            </p>
          )}
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
  timeFrame,
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
          timeFrame={timeFrame}
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
