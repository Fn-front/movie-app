/**
 * useFavoriteToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useFavoriteToggle } from './useFavoriteToggle';

// --- Mocks ---

const mockAddToFavorites = jest.fn();
const mockUpdateRating = jest.fn();
const mockRemoveFromFavorites = jest.fn();

let mockIsAdding = false;
let mockIsUpdating = false;
let mockIsRemoving = false;

jest.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavorites: () => ({
    favorites: undefined,
    isLoading: false,
    addToFavorites: mockAddToFavorites,
    updateRating: mockUpdateRating,
    removeFromFavorites: mockRemoveFromFavorites,
    get isAdding() {
      return mockIsAdding;
    },
    get isUpdating() {
      return mockIsUpdating;
    },
    get isRemoving() {
      return mockIsRemoving;
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
    mockIsAdding = false;
    mockIsUpdating = false;
    mockIsRemoving = false;
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

  it('isAdding=trueの場合isProcessingがtrueを返す', () => {
    mockIsAdding = true;
    const { result } = renderHook(() => useFavoriteToggle());
    expect(result.current.isProcessing).toBe(true);
  });

  it('isUpdating=trueの場合isProcessingがtrueを返す', () => {
    mockIsUpdating = true;
    const { result } = renderHook(() => useFavoriteToggle());
    expect(result.current.isProcessing).toBe(true);
  });

  it('isRemoving=trueの場合isProcessingがtrueを返す', () => {
    mockIsRemoving = true;
    const { result } = renderHook(() => useFavoriteToggle());
    expect(result.current.isProcessing).toBe(true);
  });

  it('isAdding=trueかつprocessingIdsに含まれている場合isFavoriteProcessingがtrueを返す', () => {
    mockIsAdding = true;
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });
    act(() => {
      result.current.handleModalSubmit(7);
    });

    expect(result.current.isFavoriteProcessing(42)).toBe(true);
  });

  it('isRemoving=trueかつprocessingIdsに含まれている場合isFavoriteProcessingがtrueを返す', () => {
    mockIsRemoving = true;
    const { result } = renderHook(() => useFavoriteToggle());
    const favorite = { id: 'fav-1', rating: 5 };

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), favorite);
    });
    act(() => {
      result.current.handleDelete();
    });

    expect(result.current.isFavoriteProcessing(42)).toBe(true);
  });

  it('processingIdsに含まれていない映画はisFavoriteProcessingがfalseを返す', () => {
    mockIsAdding = true;
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });
    act(() => {
      result.current.handleModalSubmit(7);
    });

    expect(result.current.isFavoriteProcessing(999)).toBe(false);
  });
});
