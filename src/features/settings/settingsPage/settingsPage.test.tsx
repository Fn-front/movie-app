const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/lib/api/user/user', () => ({
  getSettings: jest.fn().mockResolvedValue({
    theme: 'light',
    notificationEnabled: false,
  }),
  updateProfile: jest.fn(),
  updateSettings: jest.fn(),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('@/features/settings/changePasswordForm/changePasswordForm', () => ({
  ChangePasswordForm: ({ email }: { email: string }) => (
    <div data-testid='change-password-form' data-email={email} />
  ),
}));

jest.mock(
  '@/features/dismissedMovies/component/dismissedMoviesList/dismissedMoviesList',
  () => ({
    DismissedMoviesList: () => <div data-testid='dismissed-movies-list' />,
  }),
);

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { SettingsPage } from './settingsPage';

// --- Tests ---

describe('SettingsPage', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'テストユーザー',
          email: 'test@example.com',
          image: null,
        },
      },
      status: 'authenticated',
      update: jest.fn(),
    });
  });

  it('設定見出しが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: '設定' })).toBeInTheDocument();
  });

  it('プロフィールセクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: 'プロフィール' }),
    ).toBeInTheDocument();
  });

  it('パスワード変更セクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeInTheDocument();
    const changePasswordForm = screen.getByTestId('change-password-form');
    expect(changePasswordForm).toBeInTheDocument();
    expect(changePasswordForm).toHaveAttribute(
      'data-email',
      'test@example.com',
    );
  });

  it('通知セクションが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: '通知' })).toBeInTheDocument();
  });

  it('外観セクションが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: '外観' })).toBeInTheDocument();
  });

  it('興味なし一覧セクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: '興味なし一覧' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dismissed-movies-list')).toBeInTheDocument();
  });

  it('表示名入力フィールドが表示される', () => {
    render(<SettingsPage />);
    expect(screen.getByLabelText('表示名')).toBeInTheDocument();
  });

  it('通知チェックボックスが表示される', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', {
          name: '公開日リマインダーを受け取る',
        }),
      ).toBeInTheDocument();
    });
  });

  it('テーマ選択が表示される', async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText('テーマ')).toBeInTheDocument();
    });
  });

  it('emailが空の場合パスワード変更セクションが非表示になる', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: 'テストユーザー',
          email: '',
          image: null,
        },
      },
      status: 'authenticated',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(
      screen.queryByRole('heading', { name: 'パスワード変更' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('change-password-form'),
    ).not.toBeInTheDocument();
  });

  it('sessionがnullの場合パスワード変更セクションが非表示になる', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });

    render(<SettingsPage />);

    expect(
      screen.queryByRole('heading', { name: 'パスワード変更' }),
    ).not.toBeInTheDocument();
  });
});
