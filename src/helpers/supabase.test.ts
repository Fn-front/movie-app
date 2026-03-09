/**
 * @jest-environment node
 */

/**
 * Supabaseヘルパー テスト
 */

// --- Mocks ---

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ from: jest.fn() }),
}));

// --- Tests ---

import { createServiceRoleClient, dbConnectionErrorResponse } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;

describe('createServiceRoleClient', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('環境変数がある場合にクライアントを返す', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    const result = createServiceRoleClient();

    expect(result).not.toBeNull();
    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-role-key',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it('NEXT_PUBLIC_SUPABASE_URLが未設定の場合にnullを返す', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    const result = createServiceRoleClient();

    expect(result).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('SUPABASE_SERVICE_ROLE_KEYが未設定の場合にnullを返す', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = createServiceRoleClient();

    expect(result).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});

describe('dbConnectionErrorResponse', () => {
  it('500レスポンスを返す', async () => {
    const response = dbConnectionErrorResponse();

    expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);

    const body = await response.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: ERROR_CODE.SERVER_ERROR,
        message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
      },
    });
  });
});
