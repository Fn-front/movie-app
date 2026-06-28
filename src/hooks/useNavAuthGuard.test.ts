/**
 * useNavAuthGuard フックのテスト
 */

import { renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';

import { ROUTES } from '@/constants/common';

import { useNavAuthGuard } from './useNavAuthGuard';

let mockAuthStatus = 'unauthenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: mockAuthStatus }),
}));

const mockOpenLoginPrompt = jest.fn();
jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: (selector: (s: { open: jest.Mock }) => unknown) =>
    selector({ open: mockOpenLoginPrompt }),
}));

/** preventDefault を持つ最小限のイベントモック */
const createEvent = () =>
  ({ preventDefault: jest.fn() }) as unknown as MouseEvent<HTMLAnchorElement>;

describe('useNavAuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthStatus = 'unauthenticated';
  });

  it('未認証で保護ルートをクリックすると遷移をキャンセルしログイン誘導を表示する', () => {
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    result.current.handleProtectedNavClick(ROUTES.FAVORITES)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'お気に入りを見るにはログインが必要です。',
    );
  });

  it('未認証でも公開ルートは遷移を許可しログイン誘導を出さない', () => {
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    result.current.handleProtectedNavClick(ROUTES.UPCOMING)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
  });

  it('認証済みなら保護ルートでも遷移を許可しログイン誘導を出さない', () => {
    mockAuthStatus = 'authenticated';
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    result.current.handleProtectedNavClick(ROUTES.WATCHLIST)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
  });

  it('保護ルートごとに適切なメッセージを表示する', () => {
    const { result } = renderHook(() => useNavAuthGuard());

    result.current.handleProtectedNavClick(ROUTES.WATCHLIST)(createEvent());
    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'ウォッチリストを見るにはログインが必要です。',
    );

    result.current.handleProtectedNavClick(ROUTES.THEATER_EXPERIENCE)(
      createEvent(),
    );
    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'シアター体験を見るにはログインが必要です。',
    );
  });
});
