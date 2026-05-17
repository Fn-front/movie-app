/**
 * 劇場APIクライアント テスト
 */

import { axiosInstance } from '@/lib/axios/axios';

import { getTheaters, getTheaterBySlug } from './theaters';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
  },
}));

const mockGet = axiosInstance.get as jest.Mock;

describe('getTheaters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('劇場一覧を取得する', async () => {
    const mockData = {
      theaters: [
        {
          id: 'uuid-1',
          name: '汎用中規模シアター',
          slug: 'standard-medium',
          format: 'standard',
          audio_layout: 'atmos_9_1_6',
          description: 'テスト劇場',
        },
      ],
    };

    mockGet.mockResolvedValue({
      data: { success: true, data: mockData },
    });

    const result = await getTheaters();

    expect(result).toEqual(mockData);
    expect(mockGet).toHaveBeenCalledWith('/api/theaters');
  });

  it('APIエラー時は例外がスローされる', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(getTheaters()).rejects.toThrow('Network error');
  });
});

describe('getTheaterBySlug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('指定slugの劇場詳細を取得する', async () => {
    const mockData = {
      theater: {
        id: 'uuid-1',
        name: '汎用中規模シアター',
        slug: 'standard-medium',
        format: 'standard',
        room_width: 20,
        room_depth: 25,
        room_height: 8,
        screen_width: 14,
        screen_height: 6,
        screen_center_x: 0,
        screen_center_y: 4,
        screen_center_z: 12.5,
        audio_layout: 'atmos_9_1_6',
        seats: [],
        speakers: [],
      },
    };

    mockGet.mockResolvedValue({
      data: { success: true, data: mockData },
    });

    const result = await getTheaterBySlug('standard-medium');

    expect(result).toEqual(mockData);
    expect(mockGet).toHaveBeenCalledWith('/api/theaters/standard-medium');
  });

  it('slugがURLパスに含まれる', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { theater: { id: 'uuid-1', seats: [], speakers: [] } },
      },
    });

    await getTheaterBySlug('toho-roppongi-s7');

    expect(mockGet).toHaveBeenCalledWith('/api/theaters/toho-roppongi-s7');
  });

  it('APIエラー時は例外がスローされる', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(getTheaterBySlug('standard-medium')).rejects.toThrow(
      'Network error',
    );
  });
});
