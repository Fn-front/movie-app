import { renderHook, act } from '@testing-library/react';

import { useRecommendationRefresh } from './useRecommendationRefresh';
import {
  RECOMMENDATION_REFRESH_MESSAGES,
  RECOMMENDATION_REFRESH,
} from '@/constants';
import type { Recommendation } from '@/schema/recommendations';

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/api/recommendations/recommendations', () => ({
  refreshRecommendations: jest.fn(),
  getRefreshCount: jest.fn(),
}));

const mockMutate = jest.fn();
const mockSetQueryData = jest.fn();
let mockOnSuccess:
  | ((data: {
      remainingCount: number;
      recommendations: Recommendation[];
    }) => void)
  | undefined;
let mockOnError: ((error: unknown) => void) | undefined;
let mockIsPending = false;

let mockQueryData:
  | {
      usedCount: number;
      maxCount: number;
      remainingCount: number;
    }
  | undefined = {
  usedCount: 3,
  maxCount: 10,
  remainingCount: 7,
};
let mockIsLoading = false;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
  useMutation: (opts: {
    mutationFn: unknown;
    onSuccess?: (data: {
      remainingCount: number;
      recommendations: Recommendation[];
    }) => void;
    onError?: (error: unknown) => void;
  }) => {
    mockOnSuccess = opts.onSuccess;
    mockOnError = opts.onError;
    return {
      mutate: mockMutate,
      get isPending() {
        return mockIsPending;
      },
    };
  },
  useQuery: () => ({
    get data() {
      return mockQueryData;
    },
    get isLoading() {
      return mockIsLoading;
    },
  }),
}));

describe('useRecommendationRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
    mockIsLoading = false;
    mockOnSuccess = undefined;
    mockOnError = undefined;
    mockQueryData = {
      usedCount: 3,
      maxCount: 10,
      remainingCount: 7,
    };
  });

  it('初期状態で正しい値を返す', () => {
    const { result } = renderHook(() => useRecommendationRefresh());

    expect(result.current.remainingCount).toBe(7);
    expect(result.current.maxCount).toBe(10);
    expect(result.current.usedCount).toBe(3);
    expect(result.current.isLimitReached).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isCountLoading).toBe(false);
  });

  it('refreshでmutateが呼ばれる', () => {
    const { result } = renderHook(() => useRecommendationRefresh());

    act(() => {
      result.current.refresh();
    });

    expect(mockMutate).toHaveBeenCalled();
  });

  it('onSuccess時にクエリキャッシュ更新とトーストが表示される', () => {
    const mockOnSuccessCallback = jest.fn();
    renderHook(() => useRecommendationRefresh(mockOnSuccessCallback));

    const mockData = {
      remainingCount: 6,
      recommendations: [
        {
          id: 'rec-1',
          tmdb_movie_id: 100,
          title: 'テスト',
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: 'テスト理由',
          display_order: 1,
        },
      ] as Recommendation[],
    };

    act(() => {
      mockOnSuccess?.(mockData);
    });

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['recommendations', 'refreshCount'],
      {
        usedCount: RECOMMENDATION_REFRESH.MAX_COUNT - 6,
        maxCount: RECOMMENDATION_REFRESH.MAX_COUNT,
        remainingCount: 6,
      },
    );
    expect(mockToast).toHaveBeenCalledWith({
      title: RECOMMENDATION_REFRESH_MESSAGES.SUCCESS,
      variant: 'success',
    });
    expect(mockOnSuccessCallback).toHaveBeenCalledWith(
      mockData.recommendations,
    );
  });

  it('onError時にエラートーストが表示される', () => {
    renderHook(() => useRecommendationRefresh());

    act(() => {
      mockOnError?.(new Error('API Error'));
    });

    expect(mockToast).toHaveBeenCalledWith({
      title: RECOMMENDATION_REFRESH_MESSAGES.GENERATION_FAILED,
      variant: 'error',
    });
  });

  it('isPending時にisRefreshingがtrueを返す', () => {
    mockIsPending = true;
    const { result } = renderHook(() => useRecommendationRefresh());

    expect(result.current.isRefreshing).toBe(true);
  });

  it('isLoading時にisCountLoadingがtrueを返す', () => {
    mockIsLoading = true;
    const { result } = renderHook(() => useRecommendationRefresh());

    expect(result.current.isCountLoading).toBe(true);
  });

  it('countDataがundefinedの場合デフォルト値を返す', () => {
    mockQueryData = undefined;
    const { result } = renderHook(() => useRecommendationRefresh());

    expect(result.current.usedCount).toBe(0);
    expect(result.current.maxCount).toBe(RECOMMENDATION_REFRESH.MAX_COUNT);
    expect(result.current.remainingCount).toBe(
      RECOMMENDATION_REFRESH.MAX_COUNT,
    );
    expect(result.current.isLimitReached).toBe(false);
  });

  it('onSuccessでコールバックが未指定の場合もエラーにならない', () => {
    renderHook(() => useRecommendationRefresh());

    const mockData = {
      remainingCount: 9,
      recommendations: [] as Recommendation[],
    };

    expect(() => {
      act(() => {
        mockOnSuccess?.(mockData);
      });
    }).not.toThrow();
  });
});
