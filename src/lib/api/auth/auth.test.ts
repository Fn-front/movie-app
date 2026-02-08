/**
 * 認証APIクライアントのテスト
 */

import { axiosInstance } from '@/lib/axios/axios';
import { registerUser } from './auth';

jest.mock('@/lib/axios/axios', () => ({
  axiosInstance: {
    post: jest.fn(),
  },
}));

const mockPost = axiosInstance.post as jest.MockedFunction<typeof axiosInstance.post>;

describe('auth API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    const registerData = {
      email: 'test@example.com',
      password: 'Password1',
      name: 'テストユーザー',
    };

    it('登録に成功した場合、レスポンスデータを返す', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { userId: 'test-uuid' },
          message: '登録が完了しました。',
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      const result = await registerUser(registerData);

      expect(mockPost).toHaveBeenCalledWith('/api/auth/register', registerData);
      expect(result).toEqual(mockResponse.data);
    });

    it('名前なしで登録できる', async () => {
      const dataWithoutName = {
        email: 'test@example.com',
        password: 'Password1',
      };
      const mockResponse = {
        data: {
          success: true,
          data: { userId: 'test-uuid' },
          message: '登録が完了しました。',
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      await registerUser(dataWithoutName);

      expect(mockPost).toHaveBeenCalledWith('/api/auth/register', dataWithoutName);
    });

    it('APIエラーの場合、例外をスローする', async () => {
      mockPost.mockRejectedValue(new Error('Network Error'));

      await expect(registerUser(registerData)).rejects.toThrow('Network Error');
    });
  });
});
