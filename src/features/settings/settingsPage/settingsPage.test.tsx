jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        name: 'テストユーザー',
        email: 'test@example.com',
        image: null,
      },
    },
    status: 'authenticated',
    update: jest.fn(),
  }),
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

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { SettingsPage } from './settingsPage';

// --- Tests ---

describe('SettingsPage', () => {
  it('設定見出しが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: '設定' }),
    ).toBeInTheDocument();
  });

  it('プロフィールセクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: 'プロフィール' }),
    ).toBeInTheDocument();
  });

  it('通知セクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: '通知' }),
    ).toBeInTheDocument();
  });

  it('外観セクションが表示される', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: '外観' }),
    ).toBeInTheDocument();
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
});
