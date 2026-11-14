/**
 * StreamingNoticeSettingsコンポーネント テスト
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StreamingNoticeSettings } from './streamingNoticeSettings';

// --- Mocks ---

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
}));

// jsdomには fetch の Response グローバルが無く、handleApiError の
// `instanceof Response` 判定がそのままだと ReferenceError になる
// （notificationSettings.test.tsx 等、既存の兄弟テストと同じ回避）。
jest.mock('@/utils/error', () => ({
  handleApiError: () => ({ message: 'エラーが発生しました' }),
}));

// --- Tests ---

describe('StreamingNoticeSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'any',
    });
    mockUpdateSettings.mockResolvedValue(undefined);
  });

  it('保存済みの設定を選択状態にする', async () => {
    mockGetSettings.mockResolvedValue({
      theme: 'light',
      notificationEnabled: false,
      streamingNoticeScope: 'flatrate',
    });

    render(<StreamingNoticeSettings />);

    expect(
      await screen.findByRole('radio', { name: '見放題になったときだけ' }),
    ).toBeChecked();
  });

  it('初期値は「レンタル・購入も含める」', async () => {
    render(<StreamingNoticeSettings />);

    expect(
      await screen.findByRole('radio', { name: 'レンタル・購入も含める' }),
    ).toBeChecked();
  });

  it('選択を変えると保存してトーストを出す', async () => {
    const user = userEvent.setup();
    render(<StreamingNoticeSettings />);

    await user.click(
      await screen.findByRole('radio', { name: '見放題になったときだけ' }),
    );

    await waitFor(() =>
      expect(mockUpdateSettings).toHaveBeenCalledWith({
        streamingNoticeScope: 'flatrate',
      }),
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('保存に失敗したら選択を戻してエラートーストを出す', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<StreamingNoticeSettings />);

    await user.click(
      await screen.findByRole('radio', { name: '見放題になったときだけ' }),
    );

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      ),
    );
    expect(
      screen.getByRole('radio', { name: 'レンタル・購入も含める' }),
    ).toBeChecked();
  });

  /**
   * 読み取り失敗を既定値で描かない（#1163）
   *
   * ⚠️ ここは以前「設定の取得に失敗しても既定値で表示する」として
   * **不具合のほうを期待値にしていた**。「定額見放題のみ」にしてある
   * 利用者に「レンタル・購入も含める」が選択済みとして表示され、
   * 選び直すと保存されて設定そのものが変わる
   */
  describe('読み取りに失敗したとき', () => {
    beforeEach(() => {
      mockGetSettings.mockRejectedValue(new Error('boom'));
    });

    it('既定値のラジオを出さない', async () => {
      render(<StreamingNoticeSettings />);

      await screen.findByRole('alert');

      expect(
        screen.queryByRole('radio', { name: 'レンタル・購入も含める' }),
      ).not.toBeInTheDocument();
    });

    it('読み込めなかったことを伝える', async () => {
      render(<StreamingNoticeSettings />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '配信開始のお知らせ設定を読み込めませんでした',
      );
    });

    it('書き込みが発生しない', async () => {
      render(<StreamingNoticeSettings />);

      await screen.findByRole('alert');

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it('再読み込みで復帰できる', async () => {
      const user = userEvent.setup();
      render(<StreamingNoticeSettings />);
      await screen.findByRole('alert');

      mockGetSettings.mockResolvedValue({ streamingNoticeScope: 'flatrate' });
      await user.click(screen.getByRole('button', { name: '再読み込み' }));

      expect(
        await screen.findByRole('radio', { name: '見放題になったときだけ' }),
      ).toBeChecked();
    });
  });
});
