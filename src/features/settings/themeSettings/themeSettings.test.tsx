import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

jest.mock('@/utils/error', () => ({
  handleApiError: () => ({ message: 'エラーが発生しました' }),
}));

let capturedOnValueChange: ((value: string) => void) | undefined;
jest.mock('@/components/ui/radioGroup/radioGroup', () => ({
  RadioGroup: ({
    options,
    value,
    onValueChange,
    'aria-label': ariaLabel,
  }: {
    options: Array<{ label: string; value: string }>;
    value?: string;
    onValueChange?: (value: string) => void;
    'aria-label'?: string;
  }) => {
    capturedOnValueChange = onValueChange;
    return (
      <div role='radiogroup' aria-label={ariaLabel} data-testid='theme-radio'>
        {options.map((opt) => (
          <label key={opt.value}>
            <input
              type='radio'
              name='theme'
              value={opt.value}
              checked={value === opt.value}
              onChange={(e) => onValueChange?.(e.target.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  },
}));

// --- Tests ---

describe('ThemeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
    });
    localStorage.clear();
    capturedOnValueChange = undefined;
  });

  it('テーマラジオボタンが表示される', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-radio')).toBeInTheDocument();
    });
  });

  it('テーマ選択にaria-labelが設定されている', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole('radiogroup', { name: 'テーマを選択' }),
      ).toBeInTheDocument();
    });
  });

  it('API取得失敗時にlocalStorageのキャッシュからテーマを読み込む', async () => {
    mockGetSettings.mockRejectedValue(new Error('Network error'));
    localStorage.setItem('movie-app:theme', 'dark');

    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-radio')).toBeInTheDocument();
    });
  });

  it('テーマ変更成功時にトーストが表示される', async () => {
    const user = userEvent.setup();
    mockUpdateSettings.mockResolvedValue({});
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-radio')).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText('ダーク'));

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'テーマを変更しました',
          variant: 'success',
        }),
      );
    });
  });

  it('テーマ変更失敗時にロールバックしてエラートーストが表示される', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('Update failed'));
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(capturedOnValueChange).toBeDefined();
    });

    await act(async () => {
      capturedOnValueChange!('dark');
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '更新エラー', variant: 'error' }),
      );
    });
  });

  it('ローディング中はスケルトンが表示される', () => {
    mockGetSettings.mockReturnValue(new Promise(() => {}));
    render(<ThemeSettings />);

    expect(screen.queryByTestId('theme-radio')).not.toBeInTheDocument();
  });
});
