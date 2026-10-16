import { renderHook, act } from '@testing-library/react';

import { useRecommendationRefresh } from './useRecommendationRefresh';
import {
  RECOMMENDATION_REFRESH_MESSAGES,
  RECOMMENDATION_REFRESH,
} from '@/constants';
import { useRecommendationRefreshStore } from '@/features/recommendations/store/recommendationRefreshStore';
import type { Recommendation } from '@/schema/recommendations';

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/api/recommendations/recommendations', () => ({
  refreshRecommendations: jest.fn(),
  getRefreshCount: jest.fn(),
}));

// eslint-disable-next-line import-x/first
import { refreshRecommendations } from '@/lib/api/recommendations/recommendations';

const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
let mockMutationFn: (() => Promise<unknown>) | undefined;
let mockOnSuccess:
  | ((data: {
      remainingCount: number;
      recommendations: Recommendation[];
    }) => void)
  | undefined;
let mockOnError: ((error: unknown) => void) | undefined;
let mockOnSettled: (() => void) | undefined;

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
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: (opts: {
    mutationFn: () => Promise<unknown>;
    onSuccess?: (data: {
      remainingCount: number;
      recommendations: Recommendation[];
    }) => void;
    onError?: (error: unknown) => void;
    onSettled?: () => void;
  }) => {
    mockMutationFn = opts.mutationFn;
    mockOnSuccess = opts.onSuccess;
    mockOnError = opts.onError;
    mockOnSettled = opts.onSettled;
    return { mutate: mockMutate };
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
    useRecommendationRefreshStore.setState({ isRefreshing: false });
    mockIsLoading = false;
    mockMutationFn = undefined;
    mockOnSuccess = undefined;
    mockOnError = undefined;
    mockOnSettled = undefined;
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

  it('onSuccess時にトーストとコールバックが実行される', () => {
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

  it('ストアのisRefreshingがtrueならisRefreshingを返す（画面遷移後も保持）', () => {
    useRecommendationRefreshStore.setState({ isRefreshing: true });
    const { result } = renderHook(() => useRecommendationRefresh());

    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isRefreshDisabled).toBe(true);
  });

  it('mutationFn実行中はストアのisRefreshingがtrueになる', async () => {
    renderHook(() => useRecommendationRefresh());

    let resolveRefresh: ((value: unknown) => void) | undefined;
    (refreshRecommendations as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    let promise: Promise<unknown> | undefined;
    act(() => {
      promise = mockMutationFn?.();
    });

    expect(useRecommendationRefreshStore.getState().isRefreshing).toBe(true);

    await act(async () => {
      resolveRefresh?.({ remainingCount: 9, recommendations: [] });
      await promise;
    });

    expect(useRecommendationRefreshStore.getState().isRefreshing).toBe(false);
  });

  it('mutationFnが失敗してもストアのisRefreshingが解除される', async () => {
    renderHook(() => useRecommendationRefresh());

    (refreshRecommendations as jest.Mock).mockRejectedValueOnce(
      new Error('API Error'),
    );

    await act(async () => {
      await expect(mockMutationFn?.()).rejects.toThrow('API Error');
    });

    expect(useRecommendationRefreshStore.getState().isRefreshing).toBe(false);
  });

  it('mutationFn完了時に残回数クエリを無効化する', async () => {
    renderHook(() => useRecommendationRefresh());

    (refreshRecommendations as jest.Mock).mockResolvedValueOnce({
      remainingCount: 9,
      recommendations: [],
    });

    await act(async () => {
      await mockMutationFn?.();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['recommendations', 'refreshCount'],
    });
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

  describe('連打防止（クライアント側クールダウン）', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('初期状態ではクールダウン中ではなく更新可能', () => {
      const { result } = renderHook(() => useRecommendationRefresh());

      expect(result.current.isCoolingDown).toBe(false);
      expect(result.current.isRefreshDisabled).toBe(false);
    });

    it('更新完了後はクールダウンに入りボタンが無効化される', () => {
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        mockOnSettled?.();
      });

      expect(result.current.isCoolingDown).toBe(true);
      expect(result.current.isRefreshDisabled).toBe(true);
    });

    it('クールダウン中はrefreshを連打してもmutateされない', () => {
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        mockOnSettled?.();
      });

      act(() => {
        result.current.refresh();
        result.current.refresh();
        result.current.refresh();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('境界値: クールダウン満了の1ms手前ではまだ無効', () => {
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        mockOnSettled?.();
      });

      act(() => {
        jest.advanceTimersByTime(RECOMMENDATION_REFRESH.CLIENT_COOLDOWN_MS - 1);
      });

      expect(result.current.isCoolingDown).toBe(true);
    });

    it('境界値: クールダウン満了で解除され再度更新できる', () => {
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        mockOnSettled?.();
      });

      act(() => {
        jest.advanceTimersByTime(RECOMMENDATION_REFRESH.CLIENT_COOLDOWN_MS);
      });

      expect(result.current.isCoolingDown).toBe(false);
      expect(result.current.isRefreshDisabled).toBe(false);

      act(() => {
        result.current.refresh();
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('生成失敗後もクールダウンに入る（再試行の連打を抑止）', () => {
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        mockOnError?.(new Error('API Error'));
        mockOnSettled?.();
      });

      expect(result.current.isCoolingDown).toBe(true);
    });

    it('更新処理中はrefreshを呼んでもmutateされない', () => {
      useRecommendationRefreshStore.setState({ isRefreshing: true });
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        result.current.refresh();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('上限到達時はrefreshを呼んでもmutateされない', () => {
      mockQueryData = { usedCount: 10, maxCount: 10, remainingCount: 0 };
      const { result } = renderHook(() => useRecommendationRefresh());

      act(() => {
        result.current.refresh();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('アンマウント時にクールダウンタイマーが破棄される', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const { unmount } = renderHook(() => useRecommendationRefresh());

      act(() => {
        mockOnSettled?.();
      });

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
