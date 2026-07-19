/**
 * useTheaters フック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';

import { createQueryWrapper } from '@/test/queryTestUtils';

import { useTheaters } from './useTheaters';

const mockGetTheaters = jest.fn();

jest.mock('@/lib/api/theaters/theaters', () => ({
  getTheaters: (...args: unknown[]) => mockGetTheaters(...args),
}));

describe('useTheaters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('劇場一覧を取得する', async () => {
    const mockData = {
      theaters: [
        {
          id: 'uuid-1',
          name: 'スタンダードシアター（中型）',
          slug: 'standard-medium',
          format: 'standard',
          audio_layout: 'atmos_9_1_6',
        },
        {
          id: 'uuid-2',
          name: 'IMAX シアター',
          slug: 'imax-gt',
          format: 'imax',
          audio_layout: 'atmos_9_1_6',
        },
      ],
    };
    mockGetTheaters.mockResolvedValue(mockData);

    const { result } = renderHook(() => useTheaters(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockGetTheaters).toHaveBeenCalledTimes(1);
  });

  it('APIエラー時はisErrorがtrueになる', async () => {
    mockGetTheaters.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useTheaters(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
