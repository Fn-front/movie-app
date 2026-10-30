/**
 * @jest-environment jsdom
 */

/**
 * 管理者発行アカウントのフック テスト
 */

import { act, renderHook, waitFor } from '@testing-library/react';

import { useAdminAccounts } from './useAdminAccounts';

const mockFetch = jest.fn();
const mockCreate = jest.fn();
const mockReissue = jest.fn();

jest.mock('@/lib/api/adminAccounts/adminAccounts', () => ({
  fetchIssuedAccounts: () => mockFetch(),
  createIssuedAccount: (email: string) => mockCreate(email),
  reissueAccountLink: (id: string, email: string) => mockReissue(id, email),
}));

const ACCOUNT = {
  id: 'u1',
  username: 'K7M2QXPT9WFN',
  createdAt: '2026-10-30T00:00:00Z',
  lastLoginAt: null,
  hasPassword: false,
};

describe('useAdminAccounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue([ACCOUNT]);
    mockCreate.mockResolvedValue('ABCDEFGHJKMN');
    mockReissue.mockResolvedValue(undefined);
  });

  it('マウント時に一覧を取得する', async () => {
    const { result } = renderHook(() => useAdminAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.accounts).toEqual([ACCOUNT]);
  });

  it('発行したアカウント名を画面に出せる', async () => {
    const { result } = renderHook(() => useAdminAccounts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createAccount('to@example.com');
    });

    expect(result.current.issuedUsername).toBe('ABCDEFGHJKMN');
    expect(result.current.notice).toBeTruthy();
  });

  it('発行後に一覧を取り直す', async () => {
    const { result } = renderHook(() => useAdminAccounts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetch.mockClear();

    await act(async () => {
      await result.current.createAccount('to@example.com');
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it('発行に失敗したらエラーを出し、アカウント名は出さない', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAdminAccounts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createAccount('to@example.com');
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.issuedUsername).toBeNull();
  });

  it('再発行は対象IDと宛先を渡す', async () => {
    const { result } = renderHook(() => useAdminAccounts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.reissueLink('u1', 'to@example.com');
    });

    expect(mockReissue).toHaveBeenCalledWith('u1', 'to@example.com');
    expect(result.current.notice).toBeTruthy();
  });

  it('一覧の取得に失敗したらエラーを出す', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAdminAccounts());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeTruthy();
  });

  // 宛先を保存しない方針なので、画面にも履歴を残さない
  it('通知を閉じるとアカウント名も消える', async () => {
    const { result } = renderHook(() => useAdminAccounts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createAccount('to@example.com');
    });
    act(() => result.current.dismissNotice());

    expect(result.current.notice).toBeNull();
    expect(result.current.issuedUsername).toBeNull();
  });
});
