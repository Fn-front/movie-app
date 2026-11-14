/**
 * useNavAuthGuard フックのテスト
 */

import { renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';

import { ROUTES } from '@/constants/common';

import { useNavAuthGuard } from './useNavAuthGuard';

let mockAuthStatus = 'unauthenticated';
let mockSession: { user: { id: string } } | null = null;
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSession, status: mockAuthStatus }),
}));

/** 認証済みセッションを設定する（id が無いと無効化済み扱いになる / #699） */
const signIn = () => {
  mockAuthStatus = 'authenticated';
  mockSession = { user: { id: 'user-1' } };
};

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
    mockSession = null;
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
    signIn();
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    result.current.handleProtectedNavClick(ROUTES.WATCHLIST)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
  });

  it('セッション未確定の間は保護ルートでもログイン誘導を出さない', () => {
    // ログイン済みの利用者がフルロードした直後に当たる窓（#1131）。
    // ここで弾くと「ログイン済みなのにログインを求められる」になる。
    // 実際の認可は proxy.ts が担うので、遷移はそちらに任せてよい
    mockAuthStatus = 'loading';
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    result.current.handleProtectedNavClick(ROUTES.WATCHLIST)(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
  });

  it('無効化済みセッションは認証済みとして扱わない', () => {
    // user が空文字で埋まって返る（#699 / #1134）
    mockAuthStatus = 'authenticated';
    mockSession = { user: { id: '' } };
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    result.current.handleProtectedNavClick(ROUTES.WATCHLIST)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockOpenLoginPrompt).toHaveBeenCalled();
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

  it('個別メッセージ未定義の保護ルート(設定)はデフォルト文言で誘導する', () => {
    const { result } = renderHook(() => useNavAuthGuard());
    const event = createEvent();

    // SETTINGS は AUTH_REQUIRED_ROUTES に含まれるが個別メッセージは未定義
    result.current.handleProtectedNavClick(ROUTES.SETTINGS)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'このページを見るにはログインが必要です。',
    );
  });
});
