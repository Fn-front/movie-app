/**
 * useAwardsフックのテスト
 */

import { renderHook, act } from '@testing-library/react';

import { useAwards } from './useAwards';

// --- Mocks ---

jest.mock('@/lib/api/awards/awards', () => ({
  getAwards: jest.fn(),
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

// --- Tests ---

describe('useAwards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('初期状態で現在の年度がselectedYearに設定される', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.selectedYear).toBe(new Date().getFullYear());
    expect(result.current.isLoading).toBe(true);
  });

  it('データ取得成功時にdataが返される', () => {
    const mockData = {
      year: 2026,
      availableYears: [2026, 2025],
      awards: [
        {
          awardName: 'academy_awards',
          label: 'アカデミー賞',
          categories: [],
        },
      ],
    };

    mockUseQuery.mockReturnValue({
      data: mockData,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.data).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
  });

  it('handleYearChangeで年度を変更できる', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    act(() => {
      result.current.handleYearChange('2025');
    });

    expect(result.current.selectedYear).toBe(2025);
  });

  it('エラー時にisErrorがtrueになる', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useAwards());

    expect(result.current.isError).toBe(true);
  });

  it('useQueryにawardKeysが渡される', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useAwards());

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['awards', new Date().getFullYear()],
      }),
    );
  });
});
