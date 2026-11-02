/**
 * StreamingSortHintコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StreamingSortHint } from './streamingSortHint';

// --- Mocks ---

const mockGetSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

// --- Tests ---

describe('StreamingSortHint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'any',
    });
  });

  it('ヘルプのトリガーを表示する', () => {
    render(<StreamingSortHint />);

    expect(
      screen.getByRole('button', { name: '並び順について' }),
    ).toBeInTheDocument();
  });

  it('フォーカスすると説明と設定リンクを出す', async () => {
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(
      await screen.findByText(/見放題・レンタルが対象です/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '設定で変更' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('見放題のみの設定なら文言が変わる', async () => {
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'flatrate',
    });
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(await screen.findByText(/見放題のみが対象です/)).toBeInTheDocument();
  });

  it('設定の取得に失敗しても既定の文言を出す', async () => {
    mockGetSettings.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(
      await screen.findByText(/見放題・レンタルが対象です/),
    ).toBeInTheDocument();
  });
});
