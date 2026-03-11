import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NotificationSettings } from './notificationSettings';

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
});
