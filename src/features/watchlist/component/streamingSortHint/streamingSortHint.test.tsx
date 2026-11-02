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

  it('ⓘが設定ページへのリンクとして表示される', () => {
    render(<StreamingSortHint />);

    const trigger = screen.getByRole('link', {
      name: '並び順について。設定を開く',
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('href', '/settings');
  });

  it('フォーカスすると説明を出す', async () => {
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    await user.tab();

    expect(
      await screen.findByText(/見放題・レンタルが対象です/),
    ).toBeInTheDocument();
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

    // 並び順だけでなく、レンタルのバッジを出さないことも伝える（#907）
    expect(
      await screen.findByText(/見放題のみを対象にしているため/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/レンタルのみの作品にはバッジを出しません/),
    ).toBeInTheDocument();
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

  it('キーボードだけでⓘにフォーカスでき、設定ページへ遷移できる状態になる', async () => {
    const user = userEvent.setup();
    render(<StreamingSortHint />);

    // Tabのみでフォーカスが到達すること（Portal内の要素を経由しない）
    await user.tab();

    const link = screen.getByRole('link', {
      name: '並び順について。設定を開く',
    });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('href', '/settings');
  });
});
