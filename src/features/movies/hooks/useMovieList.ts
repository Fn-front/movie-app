/**
 * 映画一覧の共通カスタムフック
 * upcoming / nowShowing / home で共有するロジック
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import { getSavedFilter, saveFilter } from '@/lib/api/filters/filters';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useToastDispatch } from '@/hooks/useToast';
import {
  DEFAULT_SORT,
  DEFAULT_RELEASE_TYPE,
  FILTER_ERROR_MESSAGES,
  MOVIES_ERROR_MESSAGES,
  movieKeys,
  filterKeys,
  type WatchProviderOfferType,
} from '@/constants';
import {
  buildFilterSearchParams,
  extractFilterSearch,
  parseFilterConditionsFromParams,
  readStoredFilterConditions,
  writeStoredFilterConditions,
} from '@/features/movies/utils/movieFilterParams';
import type { RegionGroupKey } from '@/constants/movies';
import type { FilterConditions } from '@/schema/filters';
import type { DateRange } from '@/features/movies/types';

/**
 * useMovieListフックのオプション
 */
export interface UseMovieListOptions {
  /** 時間枠（home では省略可） */
  timeFrame?: 'upcoming' | 'now_showing';
  /** デフォルトのソート順 */
  defaultSortOrder?: 'asc' | 'desc';
  /** デフォルトの日付範囲（ページ固有） */
  defaultDateRange: DateRange;
}

/**
 * useMovieListフックの返り値
 */
export interface UseMovieListReturn {
  movies: MovieCacheItem[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  sortBy: string;
  releaseType: 'theatrical' | 'streaming';
  /** 時間枠（home では undefined） */
  timeFrame: 'upcoming' | 'now_showing' | undefined;
  genres: Record<number, string>;
  selectedGenreIds: number[];
  dateRange: DateRange;
  isRevivalFilter: boolean | undefined;
  /** 選択中の配信プロバイダーID */
  selectedWatchProviderIds: number[];
  /** 選択中の提供形態（空配列なら全形態） */
  selectedOfferTypes: WatchProviderOfferType[];
  /** 表示に含める地域グループ（空配列なら全地域を除外） */
  selectedRegions: RegionGroupKey[];
  /** 絞り込みが掛かっているか（ツールバーの印に使う） */
  hasActiveFilters: boolean;
  isFilterModalOpen: boolean;
  handleSortChange: (value: string) => void;
  handleReleaseTypeChange: (value: 'theatrical' | 'streaming') => void;
  handleFilterApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
    watchProviderIds?: number[],
    offerTypes?: WatchProviderOfferType[],
    regions?: RegionGroupKey[],
  ) => void;
  handleFilterModalOpen: () => void;
  handleFilterModalClose: () => void;
}

/**
 * 現在のフィルター状態からFilterConditionsを構築
 *
 * sort_by・release_typeは常に含める（デフォルト値も省略しない）。
 * 省略するとonSuccess時のキャッシュ上書きで値が消失し、
 * 再マウント時にデフォルトへフォールバックするバグの原因となる。
 */
/**
 * 永続化するフィルター状態
 *
 * 位置引数だと呼び出し側で順序を取り違えやすいため、オブジェクトで受ける
 */
interface FilterState {
  sortBy: string;
  releaseType: 'theatrical' | 'streaming';
  genreIds: number[];
  dateRange: DateRange;
  isRevival: boolean | undefined;
  watchProviderIds: number[];
  offerTypes: WatchProviderOfferType[];
  regions: RegionGroupKey[];
}

function buildFilterConditions(state: FilterState): FilterConditions {
  const conditions: FilterConditions = {
    sort_by: state.sortBy as FilterConditions['sort_by'],
    release_type: state.releaseType,
  };
  if (state.genreIds.length > 0) {
    conditions.genre_ids = state.genreIds;
  }
  if (state.dateRange.gte) {
    conditions.date_range_gte = state.dateRange.gte;
  }
  if (state.dateRange.lte) {
    conditions.date_range_lte = state.dateRange.lte;
  }
  if (state.isRevival !== undefined) {
    conditions.is_revival = state.isRevival;
  }
  if (state.watchProviderIds.length > 0) {
    conditions.watch_providers = state.watchProviderIds;
  }
  if (state.offerTypes.length > 0) {
    conditions.offer_types = state.offerTypes;
  }
  if (state.regions.length > 0) {
    conditions.include_regions = state.regions;
  }
  return conditions;
}

/**
 * 絞り込みの条件として数えないキー
 *
 * `sort_by` と `release_type` は `buildFilterConditions` が**常に入れる**
 * （既定値も省略しない。上のコメント参照）。並び順とタブの切り替えは
 * 「絞り込み」ではないので、ここだけ除く。
 */
const NON_FILTER_CONDITION_KEYS: readonly string[] = [
  'sort_by',
  'release_type',
];

/**
 * 絞り込みが掛かっているかを判定する
 *
 * ⚠️ **条件を列挙しないこと。** 以前は呼び出し側が
 * `genreIds.length > 0 || dateRange.gte || …` と手で並べており、
 * 配信プロバイダー・提供形態・地域の3つが漏れていた（#1063）。
 * **一覧は絞り込まれているのに印が出ない**状態だった。
 *
 * `buildFilterConditions` が作ったものから数えれば、条件が増えても
 * 自動で追従する。こちらが絞り込み条件の唯一の出どころ。
 *
 * ⚠️ 渡すのは**ページ既定の日付範囲を取り除いたあと**の条件。
 * 取り除かないと、既定を持つページで常に「絞り込み中」になる
 * （`stripDefaultDateRange` を通すこと）。
 *
 * @param conditions `buildFilterConditions()` の結果
 * @returns 1つでも絞り込み条件があれば true
 */
export function hasActiveFilterConditions(
  conditions: FilterConditions,
): boolean {
  return Object.keys(conditions).some(
    (key) => !NON_FILTER_CONDITION_KEYS.includes(key),
  );
}

/**
 * 映画一覧の共通カスタムフック
 */
export function useMovieList(options: UseMovieListOptions): UseMovieListReturn {
  const { timeFrame, defaultSortOrder, defaultDateRange } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // フィルターの初期値を決める。useEffectでの後追い反映だと、初期レンダリングで
  // 一瞬デフォルト値が表示されるため、初期stateに直接注入する。
  //
  // ここで読むのはマウント時の1回だけ。マウント後のURL変更（戻る／進む）への
  // 追従は下の「URL追従」effect が担う。
  // かつては「以降のURL変更は自前の router.replace によるもののため追従不要」と
  // していたが、#1026 でフィルターモーダルが履歴エントリを積むようになって
  // 成立しなくなった。syncFiltersToUrl の router.replace が**ページではなく
  // モーダルのエントリ**を置き換えるため、「絞り込み前のURL」が履歴に残り、
  // 戻ると URL だけクエリが消えて一覧は絞り込まれたまま、という食い違いが
  // 起きていた（#1051）。
  //
  // 優先順位: URL > localStorage > saved_filters > デフォルト
  // URLは共有・ブラウザバックの正であり最優先。クエリを持たないナビリンク経由の
  // 遷移では localStorage が受け皿になる（未認証ユーザーの唯一の復元手段）。
  //
  // localStorage をレンダリング中に読むが、この2画面はいずれも実質クライアント
  // 専用レンダリング（now-showing は Suspense 境界、upcoming は ssr:false の
  // dynamic import）のため、ハイドレーションミスマッチは発生しない。
  const [initialFilters] = useState<{
    conditions: FilterConditions;
    hasAny: boolean;
  }>(() => {
    const fromUrl = parseFilterConditionsFromParams(
      new URLSearchParams(searchParams.toString()),
    );
    if (Object.keys(fromUrl).length > 0) {
      return { conditions: fromUrl, hasAny: true };
    }

    const fromStorage = readStoredFilterConditions();
    return {
      conditions: fromStorage,
      hasAny: Object.keys(fromStorage).length > 0,
    };
  });

  const urlFilters = initialFilters.conditions;
  const hasUrlFilters = initialFilters.hasAny;

  const [sortBy, setSortBy] = useState<string>(
    urlFilters.sort_by ?? DEFAULT_SORT,
  );
  const [releaseType, setReleaseType] = useState<'theatrical' | 'streaming'>(
    urlFilters.release_type ?? DEFAULT_RELEASE_TYPE,
  );
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>(
    urlFilters.genre_ids ?? [],
  );
  const [dateRange, setDateRange] = useState<DateRange>({
    gte: urlFilters.date_range_gte ?? defaultDateRange.gte,
    lte: urlFilters.date_range_lte ?? defaultDateRange.lte,
  });
  const [isRevivalFilter, setIsRevivalFilter] = useState<boolean | undefined>(
    urlFilters.is_revival,
  );
  const [selectedWatchProviderIds, setSelectedWatchProviderIds] = useState<
    number[]
  >(urlFilters.watch_providers ?? []);
  const [selectedOfferTypes, setSelectedOfferTypes] = useState<
    WatchProviderOfferType[]
  >(urlFilters.offer_types ?? []);
  const [selectedRegions, setSelectedRegions] = useState<RegionGroupKey[]>(
    urlFilters.include_regions ?? [],
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const { toast } = useToastDispatch();
  const { isAuthenticated, isResolving } = useAuthStatus();
  // URL または localStorage に値がある場合はそれを正とし、saved_filters で上書きしない
  const [savedFilterApplied, setSavedFilterApplied] = useState(hasUrlFilters);
  const queryClient = useQueryClient();

  /**
   * ページ既定の日付範囲を effect から読むための控え。
   *
   * ⚠️ 呼び出し側（`useNowShowing` / `useUpcoming` / `useHome`）は
   * `defaultDateRange: {}` を**毎レンダー新しいオブジェクトリテラル**で渡す。
   * これを effect の依存配列に入れると、URLが変わっていなくても毎レンダー
   * 再実行される。下の「URL追従」effect にとってそれは致命的なので
   * （理由は当該コメント）、フック側で閉じて呼び出し側のメモ化に依存しない。
   */
  const defaultDateRangeRef = useRef(defaultDateRange);

  useEffect(() => {
    defaultDateRangeRef.current = defaultDateRange;
  }, [defaultDateRange]);

  /**
   * saved_filters による上書きを打ち切ったか。
   *
   * state だけでは **同じコミット内の決定が見えない**。「URLの変更」と
   * 「saved_filters の到着」が同じコミットに乗ると、後に宣言された復元 effect が
   * 古い `savedFilterApplied === false` を読み、URL由来の state を踏み潰す。
   * 以降この状態は自己修復しないため、#1051 と同じ食い違いが恒久的に残る。
   * ref なら直前の決定がその場で見えるので、effect の宣言順に依存しない。
   */
  const savedFilterAppliedRef = useRef(savedFilterApplied);

  /** 以降は saved_filters で上書きしないと決める */
  const markSavedFilterApplied = useCallback(() => {
    savedFilterAppliedRef.current = true;
    setSavedFilterApplied(true);
  }, []);

  /**
   * 「URLと現在のstateは一致している」と最後に判断したクエリ文字列。
   *
   * 自前の `router.replace` で起きたURL変更と、戻る／進むで起きたURL変更を
   * 見分けるために持つ。前者で state を作り直すと
   * **replace → searchParams の変化 → setState → replace** のループになる。
   *
   * 初期値はマウント時のクエリ。初期stateは既にURLから作ってあるので、
   * マウント直後に追従処理を走らせてはいけない。走らせると、クエリを持たない
   * ナビリンク経由の遷移で localStorage から復元した値を、空のURLで消してしまう。
   * フィルター以外のクエリ（`?utm_source=…` など）が付いた入口でも同じ。
   */
  const syncedSearchRef = useRef(extractFilterSearch(searchParams));

  // URL追従: 戻る／進むでURLが変わったら、フィルターstateをURLから作り直す。
  //
  // URLを正とする。クエリが消えたなら絞り込みも解除されるべきで、
  // 「URLはクエリなし・一覧は絞り込み済み」という食い違いを残さない（#1051）。
  //
  // ここでの setState は URL（外部の状態）からUIローカル状態への同期のため、
  // effect 内で行う必要がある。
  //
  // localStorage は読み直さない。戻る操作は「さっきのURLの状態に戻す」ことが
  // 期待値で、端末に残った別の条件を持ち出す場面ではない。
  // localStorage は従来どおり「クエリを持たない経路で入り直したとき」の
  // 受け皿として、マウント時の初期化だけで使う。
  //
  // ⚠️ 依存配列は searchParams だけに保つこと。毎レンダー変わる値を混ぜると
  // URLが変わっていなくても再実行され、**自前の replace が着地する前**に走る。
  // `router.replace` はトランジションなので同期レーンのコミットが先に走り、
  // その時点では searchParams はまだ古く syncedSearchRef はもう新しい。
  // ガードを素通りして、適用したばかりの絞り込みを解除してしまう。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // フィルターに関係するキーだけを比べる。クエリ文字列そのものを比べると、
    // 映画詳細モーダルの movie_id（#1033）が増減しただけで作り直してしまう
    const search = extractFilterSearch(searchParams);
    if (search === syncedSearchRef.current) return;
    syncedSearchRef.current = search;

    const conditions = parseFilterConditionsFromParams(
      new URLSearchParams(search),
    );
    const pageDefaultDateRange = defaultDateRangeRef.current;

    setSortBy(conditions.sort_by ?? DEFAULT_SORT);
    setReleaseType(conditions.release_type ?? DEFAULT_RELEASE_TYPE);
    setSelectedGenreIds(conditions.genre_ids ?? []);
    setDateRange({
      gte: conditions.date_range_gte ?? pageDefaultDateRange.gte,
      lte: conditions.date_range_lte ?? pageDefaultDateRange.lte,
    });
    setIsRevivalFilter(conditions.is_revival);
    setSelectedWatchProviderIds(conditions.watch_providers ?? []);
    setSelectedOfferTypes(conditions.offer_types ?? []);
    setSelectedRegions(conditions.include_regions ?? []);

    // 以降はURLが正。後から届く saved_filters で上書きさせない
    // （上書きするとURLと画面がまた食い違う）
    markSavedFilterApplied();
  }, [searchParams, markSavedFilterApplied]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 保存済みフィルターの取得
  const savedFilterQuery = useQuery({
    queryKey: filterKeys.saved,
    queryFn: getSavedFilter,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  // 保存済みフィルターをUIステートに1回だけ反映
  // savedFilterQuery.dataはサーバー状態からUIローカル状態への初期同期のため、useEffect内のsetStateが必要
  //
  // 適用済みの判定は state ではなく ref で行う。同じコミットで上のURL追従が
  // 決着をつけていても、state 経由では古い値しか見えず上書きしてしまう
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (savedFilterAppliedRef.current) return;
    if (!savedFilterQuery.data) return;

    markSavedFilterApplied();
    const conditions = savedFilterQuery.data;
    const hasConditions = Object.keys(conditions).length > 0;
    if (!hasConditions) return;

    const pageDefaultDateRange = defaultDateRangeRef.current;

    setSortBy(conditions.sort_by || DEFAULT_SORT);
    setReleaseType(conditions.release_type || DEFAULT_RELEASE_TYPE);
    setSelectedGenreIds(conditions.genre_ids || []);
    setDateRange({
      gte: conditions.date_range_gte || pageDefaultDateRange.gte,
      lte: conditions.date_range_lte || pageDefaultDateRange.lte,
    });
    setIsRevivalFilter(conditions.is_revival);
    setSelectedWatchProviderIds(conditions.watch_providers || []);
    setSelectedOfferTypes(conditions.offer_types || []);
    setSelectedRegions(conditions.include_regions || []);
  }, [savedFilterQuery.data, markSavedFilterApplied]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // フィルター準備完了の判定
  // 認証済みユーザーはsavedFilterの取得完了まで映画取得を待機
  const isFilterReady =
    !isResolving &&
    (!isAuthenticated ||
      savedFilterQuery.isFetched ||
      savedFilterQuery.isError);

  // 映画一覧クエリのベースパラメータを構築（pageを除く）
  // useEffectによるstate同期前でも保存済みフィルターを直接参照してタイミングギャップを排除
  const moviesBaseParams = useMemo(() => {
    const saved =
      !savedFilterApplied && savedFilterQuery.data
        ? savedFilterQuery.data
        : undefined;

    const effectiveGenreIds = saved?.genre_ids ?? selectedGenreIds;
    const effectiveWatchProviders =
      saved?.watch_providers ?? selectedWatchProviderIds;
    const effectiveOfferTypes = saved?.offer_types ?? selectedOfferTypes;
    const effectiveRegions = saved?.include_regions ?? selectedRegions;

    return {
      sort_by: (saved?.sort_by ?? sortBy) as
        | 'release_date'
        | 'popularity'
        | 'vote_average',
      sort_order: defaultSortOrder,
      release_type: saved?.release_type ?? releaseType,
      time_frame: timeFrame,
      genre_ids:
        effectiveGenreIds.length > 0 ? effectiveGenreIds.join(',') : undefined,
      release_date_gte:
        (saved ? saved.date_range_gte : dateRange.gte) || undefined,
      release_date_lte:
        (saved ? saved.date_range_lte : dateRange.lte) || undefined,
      is_revival: saved ? saved.is_revival : isRevivalFilter,
      watch_providers:
        effectiveWatchProviders.length > 0
          ? effectiveWatchProviders.join(',')
          : undefined,
      offer_types:
        effectiveOfferTypes.length > 0
          ? effectiveOfferTypes.join(',')
          : undefined,
      include_regions:
        effectiveRegions.length > 0 ? effectiveRegions.join(',') : undefined,
    };
  }, [
    sortBy,
    defaultSortOrder,
    releaseType,
    timeFrame,
    selectedGenreIds,
    dateRange,
    isRevivalFilter,
    selectedWatchProviderIds,
    selectedOfferTypes,
    selectedRegions,
    savedFilterApplied,
    savedFilterQuery.data,
  ]);

  // 映画一覧の無限スクロール取得
  const moviesQuery = useInfiniteQuery({
    queryKey: movieKeys.list(moviesBaseParams),
    queryFn: ({ pageParam, signal }) =>
      getMovies({ ...moviesBaseParams, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.data.pagination.nextPage ?? undefined,
    enabled: isFilterReady,
  });

  // エラー時のトースト表示
  useEffect(() => {
    if (moviesQuery.error) {
      toast({
        title: 'エラー',
        description: MOVIES_ERROR_MESSAGES.FETCH_FAILED,
        variant: 'error',
      });
    }
  }, [moviesQuery.error, toast]);

  // フィルター保存のmutation
  const { mutate: saveFilterMutate } = useMutation({
    mutationFn: saveFilter,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(filterKeys.saved, variables);
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: FILTER_ERROR_MESSAGES.SAVE_FAILED,
        variant: 'error',
      });
    },
  });

  const saveFilterIfAuthenticated = useCallback(
    (conditions: FilterConditions) => {
      if (!isAuthenticated) return;
      saveFilterMutate(conditions);
    },
    [isAuthenticated, saveFilterMutate],
  );

  /**
   * フィルター状態をURLに反映する
   *
   * 同一ページ内の状態変化のため replace（履歴を積まない）。
   * ページ固有のデフォルト日付範囲はURLに書かない。書いてしまうと、
   * 並び順を変えただけでその日の既定範囲が固定され、翌日以降も
   * 古い範囲で絞り込まれてしまうため。
   */
  /** ページ既定の日付範囲を取り除く（陳腐化防止。上の syncFiltersToUrl の説明を参照） */
  const stripDefaultDateRange = useCallback(
    (conditions: FilterConditions): FilterConditions => {
      const stripped: FilterConditions = { ...conditions };
      if (stripped.date_range_gte === defaultDateRange.gte) {
        delete stripped.date_range_gte;
      }
      if (stripped.date_range_lte === defaultDateRange.lte) {
        delete stripped.date_range_lte;
      }
      return stripped;
    },
    [defaultDateRange],
  );

  const syncFiltersToUrl = useCallback(
    (conditions: FilterConditions) => {
      const urlConditions = stripDefaultDateRange(conditions);

      const params = buildFilterSearchParams(
        new URLSearchParams(searchParams.toString()),
        urlConditions,
      );
      const queryString = params.toString();

      // 自分が書いたURLであることを残す。これが無いと、直後に走る
      // URL追従 effect が戻る操作と区別できず、state を作り直してループする。
      // 比較と同じ正規化（フィルターキーのみ）を通すこと
      syncedSearchRef.current = extractFilterSearch(params);

      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams, stripDefaultDateRange],
  );

  /**
   * フィルター変更を URL・localStorage・サーバーの3箇所に伝える
   *
   * localStorage にもURLと同じ正規化（ページ既定の日付範囲を除く）を適用する。
   * 正規化せずに保存すると、並び順を変えただけでその日の既定範囲が端末に
   * 有効期限なしで焼き付き、翌日以降も古い範囲で絞り込まれてしまう。
   */
  const persistFilters = useCallback(
    (conditions: FilterConditions) => {
      syncFiltersToUrl(conditions);
      writeStoredFilterConditions(stripDefaultDateRange(conditions));
      saveFilterIfAuthenticated(conditions);
    },
    [syncFiltersToUrl, stripDefaultDateRange, saveFilterIfAuthenticated],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      setSortBy(value);
      persistFilters(
        buildFilterConditions({
          sortBy: value,
          releaseType,
          genreIds: selectedGenreIds,
          dateRange,
          isRevival: isRevivalFilter,
          watchProviderIds: selectedWatchProviderIds,
          offerTypes: selectedOfferTypes,
          regions: selectedRegions,
        }),
      );
    },
    [
      releaseType,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      selectedWatchProviderIds,
      selectedOfferTypes,
      selectedRegions,
      persistFilters,
    ],
  );

  const handleReleaseTypeChange = useCallback(
    (value: 'theatrical' | 'streaming') => {
      setReleaseType(value);
      // 配信サービスは streaming でしか効かない。劇場公開へ切り替えたときに
      // 残しておくと、タブを戻すまで条件が見えないまま保持される
      const nextWatchProviderIds =
        value === 'streaming' ? selectedWatchProviderIds : [];
      const nextOfferTypes = value === 'streaming' ? selectedOfferTypes : [];
      setSelectedWatchProviderIds(nextWatchProviderIds);
      setSelectedOfferTypes(nextOfferTypes);

      persistFilters(
        buildFilterConditions({
          sortBy,
          releaseType: value,
          genreIds: selectedGenreIds,
          dateRange,
          isRevival: isRevivalFilter,
          watchProviderIds: nextWatchProviderIds,
          offerTypes: nextOfferTypes,
          regions: selectedRegions,
        }),
      );
    },
    [
      sortBy,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      selectedWatchProviderIds,
      selectedOfferTypes,
      selectedRegions,
      persistFilters,
    ],
  );

  const handleFilterApply = useCallback(
    (
      genreIds: number[],
      newDateRange: DateRange,
      isRevival: boolean | undefined,
      watchProviderIds: number[] = [],
      offerTypes: WatchProviderOfferType[] = [],
      regions: RegionGroupKey[] = [],
    ) => {
      setSelectedGenreIds(genreIds);
      setDateRange(newDateRange);
      setIsRevivalFilter(isRevival);
      setSelectedWatchProviderIds(watchProviderIds);
      setSelectedOfferTypes(offerTypes);
      setSelectedRegions(regions);
      setIsFilterModalOpen(false);
      persistFilters(
        buildFilterConditions({
          sortBy,
          releaseType,
          genreIds,
          dateRange: newDateRange,
          isRevival,
          watchProviderIds,
          offerTypes,
          regions,
        }),
      );
    },
    [sortBy, releaseType, persistFilters],
  );

  const handleFilterModalOpen = useCallback(() => {
    setIsFilterModalOpen(true);
  }, []);

  const handleFilterModalClose = useCallback(() => {
    setIsFilterModalOpen(false);
  }, []);

  // 全ページの映画を結合（ページ間の重複を除去）
  const movies = useMemo(() => {
    const allMovies =
      moviesQuery.data?.pages.flatMap((page) => page.data.movies) ?? [];
    const seen = new Set<number>();
    return allMovies.filter((movie) => {
      if (seen.has(movie.id)) return false;
      seen.add(movie.id);
      return true;
    });
  }, [moviesQuery.data]);

  const genres = useMemo(
    () => moviesQuery.data?.pages[0]?.data.genres ?? {},
    [moviesQuery.data],
  );

  const isLoading = !isFilterReady || moviesQuery.isLoading;

  const fetchNextPage = useCallback(() => {
    moviesQuery.fetchNextPage();
  }, [moviesQuery]);

  /**
   * 絞り込みが掛かっているか（ツールバーの印に使う）
   *
   * ⚠️ **ここで組み立てて渡すこと。** 表示側で条件を並べ直すと、条件が
   * 増えたときに片方だけ更新されて漏れる（#1063 で実際に3つ漏れていた）。
   * 一覧に投げる条件と同じ `buildFilterConditions` から数える。
   */
  const hasActiveFilters = useMemo(
    () =>
      hasActiveFilterConditions(
        stripDefaultDateRange(
          buildFilterConditions({
            sortBy,
            releaseType,
            genreIds: selectedGenreIds,
            dateRange,
            isRevival: isRevivalFilter,
            watchProviderIds: selectedWatchProviderIds,
            offerTypes: selectedOfferTypes,
            regions: selectedRegions,
          }),
        ),
      ),
    [
      sortBy,
      releaseType,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      selectedWatchProviderIds,
      selectedOfferTypes,
      selectedRegions,
      stripDefaultDateRange,
    ],
  );

  return useMemo(
    () => ({
      movies,
      isLoading,
      isFetchingNextPage: moviesQuery.isFetchingNextPage,
      hasNextPage: moviesQuery.hasNextPage,
      fetchNextPage,
      sortBy,
      releaseType,
      timeFrame,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      selectedWatchProviderIds,
      selectedOfferTypes,
      selectedRegions,
      hasActiveFilters,
      isFilterModalOpen,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    }),
    [
      movies,
      isLoading,
      moviesQuery.isFetchingNextPage,
      moviesQuery.hasNextPage,
      fetchNextPage,
      sortBy,
      releaseType,
      timeFrame,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      selectedWatchProviderIds,
      selectedOfferTypes,
      selectedRegions,
      hasActiveFilters,
      isFilterModalOpen,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    ],
  );
}
