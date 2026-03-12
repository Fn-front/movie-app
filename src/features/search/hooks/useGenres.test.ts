/**
 * useGenresフックのテスト
 */

import { renderHook } from '@testing-library/react';

import { useGenres } from './useGenres';

// --- Mocks ---
jest.mock('@/lib/api/genres/genres', () => ({
  getGenresApi: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: jest.fn(),
  };
});

import { useQuery } from '@tanstack/react-query';

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

describe('useGenres', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ジャンル一覧を返す', () => {
    const mockGenres = [
      { id: 28, name: 'アクション' },
      { id: 12, name: 'アドベンチャー' },
    ];

    mockUseQuery.mockReturnValue({
      data: { data: { genres: mockGenres } },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useGenres());

    expect(result.current.genres).toEqual(mockGenres);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('ローディング中はisLoadingがtrue', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useGenres());

    expect(result.current.genres).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('エラー時はisErrorがtrue', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useGenres());

    expect(result.current.genres).toEqual([]);
    expect(result.current.isError).toBe(true);
  });

  it('データがundefinedの場合は空配列を返す', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useGenres());

    expect(result.current.genres).toEqual([]);
  });

  it('staleTimeとgcTimeが24時間に設定されている', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useQuery>);

    renderHook(() => useGenres());

    const queryOptions = mockUseQuery.mock.calls[0][0];
    expect(queryOptions.staleTime).toBe(24 * 60 * 60 * 1000);
    expect(queryOptions.gcTime).toBe(24 * 60 * 60 * 1000);
  });
});
