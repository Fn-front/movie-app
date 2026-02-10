/**
 * SessionExpiryHandlerのテスト
 */

import { renderHook } from '@testing-library/react';

import { useSessionExpiry } from './sessionExpiryHandler';

// next-auth/reactのモック
const mockSignOut = jest.fn();
let mockStatus = 'loading';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockStatus }),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

jest.mock('@/constants', () => ({
  ROUTES: { LOGIN: '/auth/signin' },
}));

describe('useSessionExpiry', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockStatus = 'loading';
  });

  it('初回レンダリング時にsignOutを呼ばないこと', () => {
    mockStatus = 'unauthenticated';
    renderHook(() => useSessionExpiry());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('authenticated → unauthenticated に変化した時にsignOutを呼ぶこと', () => {
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();

    expect(mockSignOut).toHaveBeenCalledWith({
      callbackUrl: '/auth/signin',
    });
  });

  it('loading → authenticated に変化した時にsignOutを呼ばないこと', () => {
    mockStatus = 'loading';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'authenticated';
    rerender();

    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('loading → unauthenticated に変化した時にsignOutを呼ばないこと', () => {
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

  it('signOutは1回だけ呼ばれること', () => {
    mockStatus = 'authenticated';
    const { rerender } = renderHook(() => useSessionExpiry());

    mockStatus = 'unauthenticated';
    rerender();
    rerender();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
