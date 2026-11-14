/**
 * useAuthStatus のテスト
 *
 * 「未確定」を「未ログイン」と同一視しないこと、無効化済みセッションを
 * 認証済みと誤認しないことの2点が肝。
 */

import { renderHook } from '@testing-library/react';

import { useAuthStatus } from './useAuthStatus';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

describe('useAuthStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('認証済みなら isAuthenticated が true', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });

    const { result } = renderHook(() => useAuthStatus());

    expect(result.current).toEqual({
      isAuthenticated: true,
      isResolving: false,
    });
  });

  it('未認証なら isAuthenticated が false', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });

    const { result } = renderHook(() => useAuthStatus());

    expect(result.current).toEqual({
      isAuthenticated: false,
      isResolving: false,
    });
  });

  it('解決中は未確定として返し、未認証と区別する', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });

    const { result } = renderHook(() => useAuthStatus());

    expect(result.current).toEqual({
      isAuthenticated: false,
      isResolving: true,
    });
  });

  it('無効化済みセッション（user.id が空文字）は認証済みにしない', () => {
    // パスワード変更・絶対期限切れは user を空文字で埋めて返るため、
    // セッションの存在確認では判定できない（#699）
    mockUseSession.mockReturnValue({
      data: { user: { id: '', email: '' } },
      status: 'authenticated',
    });

    const { result } = renderHook(() => useAuthStatus());

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('user を持たないセッションは認証済みにしない', () => {
    mockUseSession.mockReturnValue({ data: {}, status: 'authenticated' });

    const { result } = renderHook(() => useAuthStatus());

    expect(result.current.isAuthenticated).toBe(false);
  });

  it('状態が変わらなければ同じ参照を返す', () => {
    // 返り値を依存配列に入れる呼び出し側で、毎レンダー再実行させないため
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });

    const { result, rerender } = renderHook(() => useAuthStatus());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
