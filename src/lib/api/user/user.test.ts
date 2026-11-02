/**
 * ユーザー設定API クライアント テスト
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { UserSettings } from '@/schema/user';

import { getSettings, updateSettings } from './user';

// axiosInstanceをモック
jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const mockedAxios = axiosInstance as jest.Mocked<typeof axiosInstance>;

describe('user API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateSettings', () => {
    it('streamingNoticeScope を渡すとPUTボディに乗る（配信範囲の欠落防止）', async () => {
      mockedAxios.put.mockResolvedValue({ data: { success: true } });

      await updateSettings({ streamingNoticeScope: 'flatrate' });

      expect(mockedAxios.put).toHaveBeenCalledTimes(1);
      const [endpoint, body] = mockedAxios.put.mock.calls[0];
      expect(endpoint).toBe(API_ENDPOINTS.USER_SETTINGS);
      // JSON化した実送信内容で確認する（undefinedのキーはJSON.stringifyで落ちる）
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        streamingNoticeScope: 'flatrate',
      });
    });

    it('一部のフィールドのみ渡した場合、未指定フィールドはリクエストボディに含まれない', async () => {
      mockedAxios.put.mockResolvedValue({ data: { success: true } });

      await updateSettings({ theme: 'dark' });

      const [, body] = mockedAxios.put.mock.calls[0];
      expect(JSON.stringify(body)).not.toContain('streamingNoticeScope');
      expect(JSON.stringify(body)).not.toContain('notificationEnabled');
      expect(JSON.parse(JSON.stringify(body))).toEqual({ theme: 'dark' });
    });
  });

  describe('getSettings', () => {
    it('APIレスポンスのdataをそのまま返す', async () => {
      const settings: UserSettings = {
        theme: 'dark',
        notificationEnabled: true,
        streamingNoticeScope: 'flatrate',
      };
      mockedAxios.get.mockResolvedValue({
        data: { success: true, data: settings },
      });

      const result = await getSettings();

      expect(mockedAxios.get).toHaveBeenCalledWith(API_ENDPOINTS.USER_SETTINGS);
      expect(result).toEqual(settings);
    });
  });
});
