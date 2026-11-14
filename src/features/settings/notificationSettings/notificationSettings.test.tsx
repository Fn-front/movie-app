import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationSettings } from './notificationSettings';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
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

// --- Tests ---

describe('NotificationSettings', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
    });
  });

  it('通知チェックボックスが表示される', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', {
          name: '公開日リマインダーを受け取る',
        }),
      ).toBeInTheDocument();
    });
  });

  it('通知設定の説明テキストが表示される', async () => {
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'ウォッチリストに追加した映画の公開日が近づいたら通知します',
        ),
      ).toBeInTheDocument();
    });
  });

  it('チェックボックスをトグルできる', async () => {
    render(<NotificationSettings />);

    const checkbox = await screen.findByRole('checkbox', {
      name: '公開日リマインダーを受け取る',
    });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      notificationEnabled: true,
    });
  });

  it('チェックボックストグル成功時にトーストが表示される', async () => {
    mockUpdateSettings.mockResolvedValue({});
    render(<NotificationSettings />);

    const checkbox = await screen.findByRole('checkbox', {
      name: '公開日リマインダーを受け取る',
    });
    await user.click(checkbox);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '通知設定を更新しました',
          variant: 'success',
        }),
      );
    });
  });

  it('更新失敗時にロールバックしてエラートーストが表示される', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('Update failed'));
    render(<NotificationSettings />);

    const checkbox = await screen.findByRole('checkbox', {
      name: '公開日リマインダーを受け取る',
    });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '更新エラー', variant: 'error' }),
      );
    });
    // ロールバック確認
    expect(checkbox).not.toBeChecked();
  });

  /**
   * 読み取り失敗を既定値で描かない（#1163）
   *
   * ⚠️ ここは以前「設定取得失敗時にデフォルト値で表示される」として
   * **不具合のほうを期待値にしていた**。オンにしてある通知が「オフ」と
   * 表示され、利用者がチェックを入れ直すと `updateSettings` が走って、
   * 表示の誤りがデータの誤りに変わる
   */
  describe('読み取りに失敗したとき', () => {
    beforeEach(() => {
      mockGetSettings.mockRejectedValue(new Error('Fetch failed'));
    });

    it('既定値のチェックボックスを出さない', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(
        screen.queryByRole('checkbox', {
          name: '公開日リマインダーを受け取る',
        }),
      ).not.toBeInTheDocument();
    });

    it('読み込めなかったことを伝える', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(
          '通知設定を読み込めませんでした',
        );
      });
    });

    it('書き込みが発生しない', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('再読み込みで復帰できる', async () => {
      render(<NotificationSettings />);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      mockGetSettings.mockResolvedValue({
        theme: 'light',
        notificationEnabled: true,
      });
      await user.click(screen.getByRole('button', { name: '再読み込み' }));

      await waitFor(() => {
        expect(
          screen.getByRole('checkbox', {
            name: '公開日リマインダーを受け取る',
          }),
        ).toBeChecked();
      });
    });
  });

  it('ローディング中はスケルトンが表示される', () => {
    mockGetSettings.mockReturnValue(new Promise(() => {}));
    render(<NotificationSettings />);

    expect(
      screen.queryByRole('checkbox', {
        name: '公開日リマインダーを受け取る',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'ウォッチリストに追加した映画の公開日が近づいたら通知します',
      ),
    ).not.toBeInTheDocument();
  });
});
