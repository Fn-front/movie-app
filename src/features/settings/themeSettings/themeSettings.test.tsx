import { render, screen, waitFor } from '@testing-library/react';

import { ThemeSettings } from './themeSettings';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

// --- Tests ---

describe('ThemeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
    });
  });

  it('テーマ選択が表示される', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('テーマ')).toBeInTheDocument();
    });
  });

  it('テーマの説明テキストが表示される', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(
        screen.getByText('アプリの外観を切り替えます'),
      ).toBeInTheDocument();
    });
  });

  it('テーマ選択のcomboboxにaria-labelが設定されている', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: 'テーマを選択' }),
      ).toBeInTheDocument();
    });
  });
});
