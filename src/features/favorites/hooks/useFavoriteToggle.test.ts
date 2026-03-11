/**
 * useFavoriteToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useFavoriteToggle } from './useFavoriteToggle';

// --- Mocks ---

const mockAddToFavorites = jest.fn();
const mockUpdateRating = jest.fn();
const mockRemoveFromFavorites = jest.fn();

jest.mock('@/features/favorites/hooks/useFavorites', () => ({
  useFavorites: () => ({
    favorites: undefined,
    isLoading: false,
    addToFavorites: mockAddToFavorites,
    updateRating: mockUpdateRating,
    removeFromFavorites: mockRemoveFromFavorites,
    isAdding: false,
    isUpdating: false,
    isRemoving: false,
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

  it('handleSubmitでaddToFavoritesが呼ばれモーダルが閉じる', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    act(() => {
      result.current.handleSubmit(7);
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

  it('handleUpdateでupdateRatingが呼ばれモーダルが閉じる', () => {
    const { result } = renderHook(() => useFavoriteToggle());
    const favorite = { id: 'fav-1', rating: 5 };

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), favorite);
    });

    act(() => {
      result.current.handleUpdate(9);
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

  it('movieがnullの場合handleSubmitは何もしない', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleSubmit(7);
    });

    expect(mockAddToFavorites).not.toHaveBeenCalled();
  });

  it('currentFavoriteがnullの場合handleUpdateは何もしない', () => {
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    act(() => {
      result.current.handleUpdate(9);
    });

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
});
