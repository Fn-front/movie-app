/**
 * useRecommendations テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import { recommendationKeys } from '@/constants';

import { useRecommendations } from './useRecommendations';

// --- Mocks ---

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

const mockGetRecommendations = jest.fn();
jest.mock('@/lib/api/recommendations/recommendations', () => ({
  getRecommendations: () => mockGetRecommendations(),
}));

// --- Helpers ---

const sampleData = {
  recommendations: [
    {
      id: 'rec-1',
      tmdb_movie_id: 101,
      title: 'おすすめ映画',
      poster_path: null,
      release_date: '2026-01-01',
      vote_average: 8,
      vote_count: 100,
      genre_ids: [28],
      reason: '理由',
      display_order: 1,
    },
  ],
  generatedAt: '2026-01-01T00:00:00.000Z',
  hasFavorites: true,
};

const renderUseRecommendations = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return {
    queryClient,
    ...renderHook(() => useRecommendations(), { wrapper }),
  };
};

// --- Tests ---

describe('useRecommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecommendations.mockResolvedValue(sampleData);
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });
  });

  it('認証済みならレコメンドを取得する', async () => {
    const { result } = renderUseRecommendations();

    await waitFor(() => {
      expect(result.current.recommendations).toHaveLength(1);
    });
    expect(result.current.hasFavorites).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  /**
   * 未認証では**リクエストを投げない**。認証必須のルートなので、
   * 投げると未ログインの訪問者が毎回401を踏む
   */
  it('未認証なら取得しない', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' });

    const { result } = renderUseRecommendations();

    expect(mockGetRecommendations).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.recommendations).toEqual([]);
    // 未認証と確定しているので「未確定」ではない
    expect(result.current.isPending).toBe(false);
  });

  // セッション解決前に「未認証」と決めつけるとセクションが一瞬消える
  it('セッション解決前は未確定として扱う', () => {
    mockUseSession.mockReturnValue({ status: 'loading' });

    const { result } = renderUseRecommendations();

    expect(result.current.isPending).toBe(true);
    expect(mockGetRecommendations).not.toHaveBeenCalled();
  });

  it('認証済みで取得中も未確定として扱う', () => {
    mockGetRecommendations.mockReturnValue(new Promise(() => {}));

    const { result } = renderUseRecommendations();

    expect(result.current.isPending).toBe(true);
  });

  /**
   * 取得失敗を「お気に入り0件」と区別できるようにする。
   *
   * ⚠️ react-query の `isPending` はエラー時 false になるため、これが無いと
   * **ゲートを通過して登録促進の文言が出る**（お気に入り登録済みでも）
   */
  it('取得に失敗したら isError を立てる', async () => {
    mockGetRecommendations.mockRejectedValue(new Error('boom'));

    const { result } = renderUseRecommendations();

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.hasFavorites).toBe(false);
  });

  it('未認証なら isError は立たない', () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' });

    const { result } = renderUseRecommendations();

    expect(result.current.isError).toBe(false);
  });

  /**
   * 手動更新の結果はローカル state ではなくキャッシュへ書く。
   * 詳細モーダルが同じキーを読むので、更新後の作品にも名前が付く
   */
  it('setRecommendations がキャッシュを差し替える', async () => {
    const { result, queryClient } = renderUseRecommendations();

    await waitFor(() => {
      expect(result.current.recommendations).toHaveLength(1);
    });

    const refreshed = [
      { ...sampleData.recommendations[0], id: 'rec-2', tmdb_movie_id: 202 },
    ];
    act(() => {
      result.current.setRecommendations(refreshed);
    });

    await waitFor(() => {
      expect(result.current.recommendations[0].tmdb_movie_id).toBe(202);
    });
    // 他のフィールドは保つ（差し替えるのは一覧だけ）
    expect(
      queryClient.getQueryData<typeof sampleData>(recommendationKeys.list)
        ?.hasFavorites,
    ).toBe(true);
  });
});
