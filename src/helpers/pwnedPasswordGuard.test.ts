/**
 * @jest-environment node
 */

/**
 * 漏洩パスワードガード テスト
 */

import { rejectPwnedPassword } from './pwnedPasswordGuard';
import { isPasswordPwned } from '@/lib/auth/pwnedPassword';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { VALIDATION_MESSAGES } from '@/constants/auth';

jest.mock('@/lib/auth/pwnedPassword', () => ({
  isPasswordPwned: jest.fn(),
}));

const mockIsPasswordPwned = isPasswordPwned as jest.MockedFunction<
  typeof isPasswordPwned
>;

describe('rejectPwnedPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('漏洩していないパスワードは null を返して通す', async () => {
    mockIsPasswordPwned.mockResolvedValue(false);

    await expect(rejectPwnedPassword('SafePassword123')).resolves.toBeNull();
    expect(mockIsPasswordPwned).toHaveBeenCalledWith('SafePassword123');
  });

  it('漏洩パスワードは400でその理由を返す', async () => {
    mockIsPasswordPwned.mockResolvedValue(true);

    const response = await rejectPwnedPassword('Password1234');

    expect(response?.status).toBe(HTTP_STATUS.BAD_REQUEST);
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_ERROR,
        message: VALIDATION_MESSAGES.PASSWORD_PWNED,
      },
    });
  });
});
