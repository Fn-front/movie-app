/**
 * @jest-environment node
 */

/**
 * 認証ヘルパー テスト
 */

// --- Mocks ---

jest.mock('@/lib/auth/auth', () => ({
  auth: jest.fn(),
}));

// --- Tests ---

import { getAuthSession, unauthorizedResponse } from './auth';
import { auth } from '@/lib/auth/auth';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAuth = auth as jest.MockedFunction<(...args: any[]) => any>;

describe('getAuthSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('session存在時にsessionを返す', async () => {
    const mockSession = {
      user: { id: 'user-123', name: 'Test User' },
      expires: '2026-12-31',
    };
    mockAuth.mockResolvedValue(mockSession);

    const result = await getAuthSession();

    expect(result).toEqual(mockSession);
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it('sessionがnullの場合にnullを返す', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getAuthSession();

    expect(result).toBeNull();
  });

  it('session.userが存在しない場合にnullを返す', async () => {
    mockAuth.mockResolvedValue({ user: undefined, expires: '2026-12-31' });

    const result = await getAuthSession();

    expect(result).toBeNull();
  });

  it('session.user.idが存在しない場合にnullを返す', async () => {
    mockAuth.mockResolvedValue({
      user: { name: 'Test User' },
      expires: '2026-12-31',
    });

    const result = await getAuthSession();

    expect(result).toBeNull();
  });
});

describe('unauthorizedResponse', () => {
  it('401レスポンスを返す', async () => {
    const response = unauthorizedResponse();

    expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);

    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: ERROR_CODE.UNAUTHORIZED,
        message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
      },
    });
  });
});
