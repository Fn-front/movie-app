/**
 * useFavoriteLookupフック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useFavoriteLookup } from './useFavoriteLookup';

// --- Mocks ---

const mockGetFavoriteLookup = jest.fn();

jest.mock('@/lib/api/favorites/favorites', () => ({
  getFavoriteLookup: (...args: unknown[]) => mockGetFavoriteLookup(...args),
}));

import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

/** 指定件数のお気に入りを作る（tmdb_movie_id は 1001 から連番） */
const createLookupResponse = (count: number) => ({
  success: true,
  data: {
    favorites: Array.from({ length: count }, (_, i) => ({
      id: `fav-${i + 1}`,
      tmdb_movie_id: 1001 + i,
      rating: (i % 10) + 1,
    })),
  },
});

// --- Tests ---

describe('useFavoriteLookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: 'user-123' } },
      status: 'authenticated',
    });
    mockGetFavoriteLookup.mockResolvedValue(createLookupResponse(1));
  });

  it('登録済みの映画はお気に入り情報を返す', async () => {
    const { result } = renderHook(() => useFavoriteLookup(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.getFavoriteInfo(1001)).toEqual({
        id: 'fav-1',
        rating: 1,
      });
    });
  });

  it('未登録の映画は null を返す', async () => {
    const { result } = renderHook(() => useFavoriteLookup(), {
      wrapper: createWrapper(),
    });

    // 読み込み前も null なので、取得が反映されたことを確かめてから判定する
    await waitFor(() => {
      expect(result.current.getFavoriteInfo(1001)).not.toBeNull();
    });

    expect(result.current.getFavoriteInfo(9999)).toBeNull();
  });

  /**
   * 一覧（useFavorites）は1ページ20件しか読まないため、そこから判定すると
   * 21件目以降が「未登録」になりハートが点かない・409 になる（#829）
   */
  it('21件目以降のお気に入りもヒットする', async () => {
    mockGetFavoriteLookup.mockResolvedValue(createLookupResponse(25));

    const { result } = renderHook(() => useFavoriteLookup(), {
      wrapper: createWrapper(),
    });

    // 21件目（index 20）と最後の25件目
    await waitFor(() => {
      expect(result.current.getFavoriteInfo(1021)).toEqual({
        id: 'fav-21',
        rating: 1,
      });
    });
    expect(result.current.getFavoriteInfo(1025)).toEqual({
      id: 'fav-25',
      rating: 5,
    });
  });

  it('お気に入り0件なら全作品が未登録になる', async () => {
    mockGetFavoriteLookup.mockResolvedValue(createLookupResponse(0));

    const { result } = renderHook(() => useFavoriteLookup(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGetFavoriteLookup).toHaveBeenCalled();
    });

    expect(result.current.getFavoriteInfo(1001)).toBeNull();
  });

  // 判定が取れないだけで画面が見られなくなる方が困るため、未登録扱いに倒す
  it('取得に失敗しても未登録扱いで返る', async () => {
    mockGetFavoriteLookup.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useFavoriteLookup(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGetFavoriteLookup).toHaveBeenCalled();
    });

    // 例外が投げられず、全作品が未登録として扱われる
    expect(result.current.getFavoriteInfo(1001)).toBeNull();
  });

  it('未認証ではお気に入り情報を問い合わせない', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useFavoriteLookup(), {
      wrapper: createWrapper(),
    });

    expect(mockGetFavoriteLookup).not.toHaveBeenCalled();
    expect(result.current.getFavoriteInfo(1001)).toBeNull();
  });

  // 無効化済みセッションは user が空文字で埋まったオブジェクトとして返る
  it('セッションの user.id が無ければ問い合わせない', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: '' } },
      status: 'authenticated',
    });

    renderHook(() => useFavoriteLookup(), { wrapper: createWrapper() });

    expect(mockGetFavoriteLookup).not.toHaveBeenCalled();
  });
});
