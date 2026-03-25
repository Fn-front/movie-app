/**
 * useFavoriteToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useFavoriteToggle } from './useFavoriteToggle';

// --- Mocks ---

const mockAddToFavorites = jest.fn();
const mockUpdateRating = jest.fn();
const mockRemoveFromFavorites = jest.fn();
const mockGetFavoriteInfo = jest.fn().mockReturnValue(null);

const mockMutationState = {
  isAdding: false,
  isUpdating: false,
  isRemoving: false,
};

const mockOpenLoginPrompt = jest.fn();

jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: (selector: (s: { open: jest.Mock }) => jest.Mock) =>
    selector({ open: mockOpenLoginPrompt }),
}));

const mockUseSession = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavorites: () => ({
    favorites: undefined,
    isLoading: false,
    addToFavorites: mockAddToFavorites,
    updateRating: mockUpdateRating,
    removeFromFavorites: mockRemoveFromFavorites,
    getFavoriteInfo: mockGetFavoriteInfo,
    get isAdding() {
      return mockMutationState.isAdding;
    },
    get isUpdating() {
      return mockMutationState.isUpdating;
    },
    get isRemoving() {
      return mockMutationState.isRemoving;
    },
  }),
}));

// --- Helpers ---

const createMovie = () => ({
  id: 42,
  title: 'テスト映画',
  poster_path: '/poster.jpg',
  release_date: '2026-01-01',
});

// --- Tests ---

describe('useFavoriteToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutationState.isAdding = false;
    mockMutationState.isUpdating = false;
    mockMutationState.isRemoving = false;
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });
  });

  it('初期状態ではモーダルが閉じている', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    expect(result.current.modalState.isOpen).toBe(false);
    expect(result.current.modalState.movie).toBeNull();
    expect(result.current.modalState.currentFavorite).toBeNull();
  });

  it('未登録映画のhandleFavoriteToggleでモーダルが開く（currentFavorite=null）', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    expect(result.current.modalState.isOpen).toBe(true);
    expect(result.current.modalState.movie?.id).toBe(42);
    expect(result.current.modalState.currentFavorite).toBeNull();
  });

  it('登録済み映画のhandleFavoriteToggleでモーダルが開く（currentFavorite付き）', () => {
    const { result } = renderHook(() => useFavoriteToggle());
    const favorite = { id: 'fav-1', rating: 8 };

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), favorite);
    });

    expect(result.current.modalState.isOpen).toBe(true);
    expect(result.current.modalState.currentFavorite).toEqual(favorite);
  });

  it('closeModalでモーダルが閉じる', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });
    expect(result.current.modalState.isOpen).toBe(true);

    act(() => {
      result.current.closeModal();
    });
    expect(result.current.modalState.isOpen).toBe(false);
  });

  it('handleModalSubmitで未登録時にaddToFavoritesが呼ばれモーダルが閉じる', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    act(() => {
      result.current.handleModalSubmit(7);
    });

    expect(mockAddToFavorites).toHaveBeenCalledWith({
      tmdb_movie_id: 42,
      title: 'テスト映画',
      poster_path: '/poster.jpg',
      release_date: '2026-01-01',
      rating: 7,
    });
    expect(result.current.modalState.isOpen).toBe(false);
  });

  it('handleModalSubmitで登録済み時にupdateRatingが呼ばれモーダルが閉じる', () => {
    const { result } = renderHook(() => useFavoriteToggle());
    const favorite = { id: 'fav-1', rating: 5 };

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), favorite);
    });

    act(() => {
      result.current.handleModalSubmit(9);
    });

    expect(mockUpdateRating).toHaveBeenCalledWith('fav-1', 9);
    expect(result.current.modalState.isOpen).toBe(false);
  });

  it('handleDeleteでremoveFromFavoritesが呼ばれモーダルが閉じる', () => {
    const { result } = renderHook(() => useFavoriteToggle());
    const favorite = { id: 'fav-1', rating: 5 };

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), favorite);
    });

    act(() => {
      result.current.handleDelete();
    });

    expect(mockRemoveFromFavorites).toHaveBeenCalledWith('fav-1');
    expect(result.current.modalState.isOpen).toBe(false);
  });

  it('movieがnullの場合handleModalSubmitは何もしない', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleModalSubmit(7);
    });

    expect(mockAddToFavorites).not.toHaveBeenCalled();
    expect(mockUpdateRating).not.toHaveBeenCalled();
  });

  it('currentFavoriteがnullの場合handleDeleteは何もしない', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    act(() => {
      result.current.handleDelete();
    });

    expect(mockRemoveFromFavorites).not.toHaveBeenCalled();
  });

  it('isProcessingがfalseを返す', () => {
    const { result } = renderHook(() => useFavoriteToggle());
    expect(result.current.isProcessing).toBe(false);
  });

  it('ミューテーション中はisFavoriteProcessingがtrueを返す', () => {
    const { result, rerender } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });
    act(() => {
      result.current.handleModalSubmit(7);
    });

    mockMutationState.isAdding = true;
    rerender();

    expect(result.current.isFavoriteProcessing(42)).toBe(true);
  });

  it('ミューテーション完了時にisFavoriteProcessingがfalseを返す', () => {
    const { result, rerender } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });
    act(() => {
      result.current.handleModalSubmit(7);
    });

    mockMutationState.isAdding = true;
    rerender();
    expect(result.current.isFavoriteProcessing(42)).toBe(true);

    mockMutationState.isAdding = false;
    rerender();
    expect(result.current.isFavoriteProcessing(42)).toBe(false);
  });

  it('getFavoriteInfoを返す', () => {
    const { result } = renderHook(() => useFavoriteToggle());
    expect(result.current.getFavoriteInfo(42)).toBeNull();
  });

  it('未認証時のhandleFavoriteToggleでログイン誘導モーダルが表示される', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'お気に入りに追加するにはログインが必要です。',
    );
    expect(result.current.modalState.isOpen).toBe(false);
  });
});
