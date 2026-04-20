/**
 * useTheater フック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';

import { createQueryWrapper } from '@/test/queryTestUtils';

import { useTheater } from './useTheater';

const mockGetTheaterBySlug = jest.fn();

jest.mock('@/lib/api/theaters/theaters', () => ({
  getTheaterBySlug: (...args: unknown[]) => mockGetTheaterBySlug(...args),
}));

describe('useTheater', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('slugを指定して劇場データを取得する', async () => {
    const mockData = {
      theater: {
        id: 'uuid-1',
        slug: 'standard-medium',
        seats: [],
        speakers: [],
      },
    };
    mockGetTheaterBySlug.mockResolvedValue(mockData);

    const { result } = renderHook(() => useTheater('standard-medium'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockGetTheaterBySlug).toHaveBeenCalledWith('standard-medium');
  });

  it('slugが空文字の場合はクエリが無効化される', () => {
    const { result } = renderHook(() => useTheater(''), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetTheaterBySlug).not.toHaveBeenCalled();
  });

  it('APIエラー時はisErrorがtrueになる', async () => {
    mockGetTheaterBySlug.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useTheater('standard-medium'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
