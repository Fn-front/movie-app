/**
 * 人物APIクライアント テスト
 */

import { axiosInstance } from '@/lib/axios/axios';

import { getPerson } from './person';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: { get: jest.fn() },
}));

const mockGet = axiosInstance.get as jest.Mock;

describe('getPerson', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('人物IDをパスに含めて取得し、dataを取り出す', async () => {
    const person = { id: 500, name: 'テスト俳優', cast: [] };
    mockGet.mockResolvedValue({ data: { success: true, data: person } });

    const result = await getPerson(500);

    expect(result).toEqual(person);
    expect(mockGet).toHaveBeenCalledWith('/api/person/500');
  });

  it('APIエラー時は例外がスローされる', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(getPerson(500)).rejects.toThrow('Network error');
  });
});
