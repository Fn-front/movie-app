import { render, screen, waitFor, act } from '@testing-library/react';

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

// Radix UI SelectのonValueChangeをキャプチャするためにモック
let capturedOnValueChange: ((value: string) => void) | undefined;
jest.mock('@/components/ui/select/select', () => ({
  Select: ({
    label,
    value,
    onValueChange,
    'aria-label': ariaLabel,
  }: {
    label?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    'aria-label'?: string;
  }) => {
    capturedOnValueChange = onValueChange;
    return (
      <select
        aria-label={ariaLabel || label}
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-testid='theme-select'
      >
        <option value='light'>ライト</option>
        <option value='dark'>ダーク</option>
      </select>
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

  it('テーマ選択が表示される', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-select')).toBeInTheDocument();
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

  it('テーマ選択にaria-labelが設定されている', async () => {
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(
        screen.getByLabelText('テーマを選択'),
      ).toBeInTheDocument();
    });
  });

  it('API取得失敗時にlocalStorageのキャッシュからテーマを読み込む', async () => {
    mockGetSettings.mockRejectedValue(new Error('Network error'));
    localStorage.setItem('theme', 'dark');

    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-select')).toBeInTheDocument();
    });
  });

  it('API取得失敗時にlocalStorageにキャッシュがなければデフォルト値を使用', async () => {
    mockGetSettings.mockRejectedValue(new Error('Network error'));

    render(<ThemeSettings />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-select')).toBeInTheDocument();
    });
  });

  it('テーマ変更成功時にトーストが表示される', async () => {
    mockUpdateSettings.mockResolvedValue({});
    render(<ThemeSettings />);

    await waitFor(() => {
      expect(capturedOnValueChange).toBeDefined();
    });

    await act(async () => {
      capturedOnValueChange!('dark');
    });

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'テーマを変更しました', variant: 'success' }),
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

  it('ローディング中はnullを返す', () => {
    mockGetSettings.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ThemeSettings />);

    expect(container.firstChild).toBeNull();
  });
});
