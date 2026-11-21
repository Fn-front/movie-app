const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('@/features/settings/changePasswordForm/changePasswordForm', () => ({
  ChangePasswordForm: ({
    email,
    hasPassword,
  }: {
    email: string;
    hasPassword: boolean;
  }) => (
    <div
      data-testid='change-password-form'
      data-email={email}
      data-has-password={String(hasPassword)}
    />
  ),
}));

import { render, screen, waitFor } from '@testing-library/react';

import { ChangePasswordPageContent } from './changePasswordPageContent';

/** `useHasPassword` が叩く `GET /api/user/totp` */
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('ChangePasswordPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
  });

  it('emailがある場合ChangePasswordFormが表示される', () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: 'test@example.com' } },
      status: 'authenticated',
    });

    render(<ChangePasswordPageContent />);

    const form = screen.getByTestId('change-password-form');
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute('data-email', 'test@example.com');
  });

  it('emailが空の場合nullを返す', () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: '' } },
      status: 'authenticated',
    });

    const { container } = render(<ChangePasswordPageContent />);

    expect(container.firstChild).toBeNull();
  });

  it('sessionがnullの場合nullを返す', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { container } = render(<ChangePasswordPageContent />);

    expect(container.firstChild).toBeNull();
  });

  /**
   * パスワードの有無はサーバーと同じ根拠で決める（#1388）
   *
   * ⛔ `ChangePasswordForm` の親は**2つある**（設定ページとこの単独ページ）。
   * E2E が叩いているのはこちらなので、ここだけセッション単独のまま残すと
   * 初回パスワード設定の直後に確認コードを1通消費したあとで 400 になる。
   */
  describe('パスワードの有無の出どころ', () => {
    it('セッションが古くても API 由来の値を渡す', async () => {
      mockUseSession.mockReturnValue({
        data: { user: { email: 'test@example.com', hasPassword: false } },
        status: 'authenticated',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { hasPassword: true } }),
      });

      render(<ChangePasswordPageContent />);

      await waitFor(() =>
        expect(screen.getByTestId('change-password-form')).toHaveAttribute(
          'data-has-password',
          'true',
        ),
      );
    });

    it('取得に失敗したらセッション由来の値のまま', async () => {
      mockUseSession.mockReturnValue({
        data: { user: { email: 'test@example.com', hasPassword: false } },
        status: 'authenticated',
      });
      mockFetch.mockRejectedValue(new Error('network down'));

      render(<ChangePasswordPageContent />);

      await waitFor(() => expect(mockFetch).toHaveBeenCalled());
      expect(screen.getByTestId('change-password-form')).toHaveAttribute(
        'data-has-password',
        'false',
      );
    });
  });
});
