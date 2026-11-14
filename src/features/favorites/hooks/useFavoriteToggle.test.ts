/**
 * useFavoriteToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { ANALYTICS_EVENTS } from '@/constants/analytics';

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

jest.mock('@/features/favorites/hooks/useFavoriteLookup', () => ({
  useFavoriteLookup: () => ({
    getFavoriteInfo: mockGetFavoriteInfo,
  }),
}));

jest.mock('@/features/favorites/hooks/useFavoriteMutations', () => ({
  useFavoriteMutations: () => ({
    addToFavorites: mockAddToFavorites,
    updateRating: mockUpdateRating,
    removeFromFavorites: mockRemoveFromFavorites,
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

  it('セッション未確定の間はログイン誘導を出さない', () => {
    // ログイン済みの利用者がフルロードした直後に当たる窓（#1131）。
    // ここで弾くと「ログイン済みなのにログインを求められる」になる
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
    // 誘導を出さない代わりにモーダルを開いてしまっては意味がない
    expect(result.current.modalState.isOpen).toBe(false);
  });

  it('無効化済みセッションはログイン誘導を出す', () => {
    // user が空文字で埋まって返る（#699 / #1134）
    mockUseSession.mockReturnValue({
      data: { user: { id: '' } },
      status: 'authenticated',
    });
    const { result } = renderHook(() => useFavoriteToggle());

    act(() => {
      result.current.handleFavoriteToggle(createMovie(), null);
    });

    expect(mockOpenLoginPrompt).toHaveBeenCalled();
  });

  /**
   * sendEvent はモックせず window.gtag を差し替える。
   * 実際に gtag へ渡る引数まで見ないと「余計な値を送っていないこと」を
   * 保証できないため（#938）
   */
  describe('GA4 計測', () => {
    const gtag = jest.fn();

    beforeEach(() => {
      window.gtag = gtag;
    });

    afterEach(() => {
      delete window.gtag;
    });

    it('新規登録で favorite_add を作品IDだけ付けて送る', () => {
      const { result } = renderHook(() => useFavoriteToggle());

      act(() => {
        result.current.handleFavoriteToggle(createMovie(), null);
      });
      act(() => {
        result.current.handleModalSubmit(7);
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.FAVORITE_ADD,
        {
          movie_id: 42,
        },
      );
    });

    it('評価更新で favorite_update を送る', () => {
      const { result } = renderHook(() => useFavoriteToggle());

      act(() => {
        result.current.handleFavoriteToggle(createMovie(), {
          id: 'fav-1',
          rating: 5,
        });
      });
      act(() => {
        result.current.handleModalSubmit(9);
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.FAVORITE_UPDATE,
        { movie_id: 42 },
      );
    });

    it('削除で favorite_remove を送る', () => {
      const { result } = renderHook(() => useFavoriteToggle());

      act(() => {
        result.current.handleFavoriteToggle(createMovie(), {
          id: 'fav-1',
          rating: 5,
        });
      });
      act(() => {
        result.current.handleDelete();
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.FAVORITE_REMOVE,
        { movie_id: 42 },
      );
    });

    it('評価の点数と作品タイトルを送らない', () => {
      // rating は未同意の利用者の分も Google へ届く嗜好情報なので含めない
      const { result } = renderHook(() => useFavoriteToggle());

      act(() => {
        result.current.handleFavoriteToggle(createMovie(), null);
      });
      act(() => {
        result.current.handleModalSubmit(7);
      });

      const sent = JSON.stringify(gtag.mock.calls);
      expect(sent).not.toContain('テスト映画');
      expect(sent).not.toContain('rating');
    });

    it('モーダルを開いただけでは送らない', () => {
      const { result } = renderHook(() => useFavoriteToggle());

      act(() => {
        result.current.handleFavoriteToggle(createMovie(), null);
      });

      expect(gtag).not.toHaveBeenCalled();
    });

    it('未認証なら送らない（モーダルが開かないため）', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      const { result } = renderHook(() => useFavoriteToggle());

      act(() => {
        result.current.handleFavoriteToggle(createMovie(), null);
      });
      act(() => {
        result.current.handleModalSubmit(7);
      });

      expect(gtag).not.toHaveBeenCalled();
    });
  });
});
