/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import SettingsLayout from './layout';

const mockRedirect = jest.fn();
const mockAuth = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error('NEXT_REDIRECT');
  },
}));

jest.mock('@/lib/auth/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/components/layout/appLayout/appLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

describe('SettingsLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('認証済みの場合、子要素を表示する', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const ui = await SettingsLayout({
      children: <div>アカウント設定</div>,
    });
    render(ui);

    expect(screen.getByText('アカウント設定')).toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('未認証の場合、サインインページにリダイレクトする', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      SettingsLayout({ children: <div>アカウント設定</div> }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/auth/signin');
  });

  it('セッションにuserがない場合、サインインページにリダイレクトする', async () => {
    mockAuth.mockResolvedValue({ user: null });

    await expect(
      SettingsLayout({ children: <div>アカウント設定</div> }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith('/auth/signin');
  });
});
