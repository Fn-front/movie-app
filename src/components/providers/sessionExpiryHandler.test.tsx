/**
 * SessionExpiryHandlerのテスト
 */

import { renderHook, waitFor } from '@testing-library/react';

import { useSessionExpiry } from './sessionExpiryHandler';

// next-auth/reactのモック
const mockSignOut = jest.fn();
let mockStatus = 'loading';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockStatus }),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockConfirmSignedOut = jest.fn();
jest.mock('@/lib/auth/sessionProbe', () => ({
  confirmSignedOut: () => mockConfirmSignedOut(),
}));

let mockPathname = '/movies/now-showing';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@/constants', () => ({
  ROUTES: { LOGIN: '/auth/signin', REGISTER: '/auth/signup' },
}));

describe('useSessionExpiry', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockStatus = 'loading';
    mockPathname = '/movies/now-showing';
    // 既定は「ログアウト済みだとサーバーが明示した」
    mockConfirmSignedOut.mockReset().mockResolvedValue(true);
  });

  it('初回レンダリング時にsignOutを呼ばないこと', () => {
    mockStatus = 'unauthenticated';
    renderHook(() => useSessionExpiry());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('authenticated → unauthenticated に変化した時にsignOutを呼ぶこと', async () => {
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();

    await waitFor(() =>
      expect(mockSignOut).toHaveBeenCalledWith({
        callbackUrl: '/auth/signin',
      }),
    );
  });

  // 以下2件は #1136。next-auth は `/api/auth/session` の通信失敗も非2xxも
  // null に潰すため、unauthenticated への変化だけでは強制ログアウトの
  // 根拠にならない。瞬断でサーバー側のセッションまで破棄してしまう
  it('セッションの不在を確認できなければsignOutしないこと', async () => {
    mockConfirmSignedOut.mockResolvedValue(false);
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();

    await waitFor(() => expect(mockConfirmSignedOut).toHaveBeenCalled());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('確認中に認証済みへ戻ったらsignOutしないこと', async () => {
    let resolveProbe: (value: boolean) => void = () => {};
    mockConfirmSignedOut.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveProbe = resolve;
      }),
    );
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();
    await waitFor(() => expect(mockConfirmSignedOut).toHaveBeenCalled());

    // 応答待ちの間に再取得が成功した
    mockStatus = 'authenticated';
    rerender();
    resolveProbe(true);

    await waitFor(() => expect(mockConfirmSignedOut).toHaveBeenCalled());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('loading → authenticated に変化した時にsignOutを呼ばないこと', () => {
    mockStatus = 'loading';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'authenticated';
    rerender();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('loading → unauthenticated に変化した時にsignOutを呼ばないこと（未ログインユーザー）', () => {
    mockStatus = 'loading';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('認証ページではsignOutを呼ばないこと', () => {
    mockPathname = '/auth/signin';
    mockStatus = 'loading';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('新規登録ページではsignOutを呼ばないこと', () => {
    mockPathname = '/auth/signup';
    mockStatus = 'loading';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('authenticated のまま変化しない場合にsignOutを呼ばないこと', () => {
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    rerender();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('signOutは1回だけ呼ばれること', async () => {
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();
    rerender();

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockConfirmSignedOut).toHaveBeenCalledTimes(1);
  });
});
