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

  it('境界値: slug 変更時に新しいクエリが実行される', async () => {
    mockGetTheaterBySlug
      .mockResolvedValueOnce({ theater: { id: 'a', slug: 'standard-medium' } })
      .mockResolvedValueOnce({ theater: { id: 'b', slug: 'imax-large' } });

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useTheater(slug),
      {
        wrapper: createQueryWrapper(),
        initialProps: { slug: 'standard-medium' },
      },
    );

    await waitFor(() => {
      expect(result.current.data?.theater.slug).toBe('standard-medium');
    });

    rerender({ slug: 'imax-large' });

    await waitFor(() => {
      expect(result.current.data?.theater.slug).toBe('imax-large');
    });

    expect(mockGetTheaterBySlug).toHaveBeenCalledTimes(2);
    expect(mockGetTheaterBySlug).toHaveBeenNthCalledWith(1, 'standard-medium');
    expect(mockGetTheaterBySlug).toHaveBeenNthCalledWith(2, 'imax-large');
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
