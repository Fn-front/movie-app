import { renderHook, act } from '@testing-library/react';

import { useDismissMovie } from './useDismissMovie';
import { DISMISSED_MOVIES_SUCCESS_MESSAGES } from '@/constants';

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/lib/api/dismissedMovies/dismissedMovies', () => ({
  addDismissedMovie: jest.fn(),
}));

const mockMutate = jest.fn();
let mockOnSuccess: (() => void) | undefined;
let mockIsPending = false;

jest.mock('@tanstack/react-query', () => ({
  useMutation: (opts: { mutationFn: unknown; onSuccess?: () => void }) => {
    mockOnSuccess = opts.onSuccess as (() => void) | undefined;
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
  genre_ids: [28, 12],
};

describe('useDismissMovie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPending = false;
    mockOnSuccess = undefined;
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

  it('onSuccess時にトーストが表示される', () => {
    renderHook(() => useDismissMovie());

    act(() => {
      mockOnSuccess?.();
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
});
