import { renderHook, act } from '@testing-library/react';

import { useDismissMovie } from './useDismissMovie';
import {
  DISMISSED_MOVIES_SUCCESS_MESSAGES,
  DISMISSED_MOVIES_ERROR_MESSAGES,
} from '@/constants';

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/api/dismissedMovies/dismissedMovies', () => ({
  addDismissedMovie: jest.fn(),
}));

const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
let mockOnSuccess: (() => void) | undefined;
let mockOnError:
  | ((error: unknown, variables: { tmdb_movie_id: number }) => void)
  | undefined;
let mockIsPending = false;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: (opts: {
    mutationFn: unknown;
    onSuccess?: () => void;
    onError?: (error: unknown, variables: { tmdb_movie_id: number }) => void;
  }) => {
    mockOnSuccess = opts.onSuccess as (() => void) | undefined;
    mockOnError = opts.onError as
      | ((error: unknown, variables: { tmdb_movie_id: number }) => void)
      | undefined;
    return {
      mutate: mockMutate,
      get isPending() {
        return mockIsPending;
      },
    };
  },
}));

const mockMovie = {
  tmdb_movie_id: 123,
  title: 'Test Movie',
  poster_path: '/test.jpg',
  genre_ids: [28, 12],
};

describe('useDismissMovie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
    mockOnSuccess = undefined;
    mockOnError = undefined;
  });

  it('dismissMovieでmutateが呼ばれる', () => {
    const { result } = renderHook(() => useDismissMovie());

    act(() => {
      result.current.dismissMovie(mockMovie);
    });

    expect(mockMutate).toHaveBeenCalledWith(mockMovie);
  });

  it('dismissMovie後にdismissedIdsに追加される', () => {
    mockIsPending = true;
    const { result, rerender } = renderHook(() => useDismissMovie());

    act(() => {
      result.current.dismissMovie(mockMovie);
    });

    rerender();

    expect(result.current.dismissedIds.has(123)).toBe(true);
  });

  it('onSuccess時にキャッシュ無効化とトーストが表示される', () => {
    renderHook(() => useDismissMovie());

    act(() => {
      mockOnSuccess?.();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['dismissed-movies'],
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: DISMISSED_MOVIES_SUCCESS_MESSAGES.ADDED,
      variant: 'success',
    });
  });

  it('isDismissingMovieがisPending=trueかつ対象IDの場合trueを返す', () => {
    mockIsPending = true;
    const { result } = renderHook(() => useDismissMovie());

    act(() => {
      result.current.dismissMovie(mockMovie);
    });

    expect(result.current.isDismissingMovie(123)).toBe(true);
  });

  it('isDismissingMovieが別のIDではfalseを返す', () => {
    mockIsPending = true;
    const { result } = renderHook(() => useDismissMovie());

    act(() => {
      result.current.dismissMovie(mockMovie);
    });

    expect(result.current.isDismissingMovie(999)).toBe(false);
  });

  it('onError時にdismissedIdsからロールバックされエラートーストが表示される', () => {
    const { result } = renderHook(() => useDismissMovie());

    act(() => {
      result.current.dismissMovie(mockMovie);
    });

    expect(result.current.dismissedIds.has(123)).toBe(true);

    act(() => {
      mockOnError?.(new Error('API Error'), { tmdb_movie_id: 123 });
    });

    expect(result.current.dismissedIds.has(123)).toBe(false);
    expect(mockToast).toHaveBeenCalledWith({
      title: DISMISSED_MOVIES_ERROR_MESSAGES.ADD_FAILED,
      variant: 'error',
    });
  });
});
