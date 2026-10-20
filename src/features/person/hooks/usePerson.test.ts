/**
 * usePersonフックのテスト
 */

import { renderHook } from '@testing-library/react';

import { PERSON_STALE_TIME_MS } from '@/constants';

import { usePerson } from './usePerson';

// --- Mocks ---

jest.mock('@/lib/api/person/person', () => ({
  getPerson: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return { ...actual, useQuery: jest.fn() };
});

import { useQuery } from '@tanstack/react-query';

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

const createQueryResult = (overrides: Record<string, unknown>) =>
  ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useQuery>;

// --- Tests ---

describe('usePerson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('人物IDごとのクエリキーとstaleTimeでクエリを張る', () => {
    mockUseQuery.mockReturnValue(createQueryResult({ isLoading: true }));

    renderHook(() => usePerson(500));

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['person', 'detail', 500],
        staleTime: PERSON_STALE_TIME_MS,
      }),
    );
  });

  it('取得中はisLoadingを返す', () => {
    mockUseQuery.mockReturnValue(createQueryResult({ isLoading: true }));

    const { result } = renderHook(() => usePerson(500));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.person).toBeUndefined();
  });

  it('取得成功時に人物詳細を返す', () => {
    const person = { id: 500, name: 'テスト俳優' };
    mockUseQuery.mockReturnValue(createQueryResult({ data: person }));

    const { result } = renderHook(() => usePerson(500));

    expect(result.current.person).toEqual(person);
    expect(result.current.isError).toBe(false);
  });

  it('取得失敗時にisErrorを返す', () => {
    mockUseQuery.mockReturnValue(createQueryResult({ isError: true }));

    const { result } = renderHook(() => usePerson(500));

    expect(result.current.isError).toBe(true);
  });

  it('refetchをそのまま公開する', () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue(createQueryResult({ refetch }));

    const { result } = renderHook(() => usePerson(500));
    result.current.refetch();

    expect(refetch).toHaveBeenCalled();
  });

  it('queryFnはgetPersonを人物IDで呼ぶ', async () => {
    const { getPerson } = jest.requireMock('@/lib/api/person/person');
    mockUseQuery.mockReturnValue(createQueryResult({}));

    renderHook(() => usePerson(42));

    const { queryFn } = mockUseQuery.mock.calls[0][0] as unknown as {
      queryFn: () => unknown;
    };
    await queryFn();

    expect(getPerson).toHaveBeenCalledWith(42);
  });
});
