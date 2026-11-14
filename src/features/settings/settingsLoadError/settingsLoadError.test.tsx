/**
 * 設定の読み取り失敗表示のテスト（#1163）
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsLoadError } from './settingsLoadError';

describe('SettingsLoadError', () => {
  it('読み取りに失敗したことを伝える', () => {
    render(<SettingsLoadError label='通知設定' onRetry={jest.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      '通知設定を読み込めませんでした',
    );
  });

  it('再試行できる', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    render(<SettingsLoadError label='通知設定' onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: '再読み込み' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  /**
   * 設定値そのものを描かない（#1163）
   *
   * 「読めなかった」と「オフだった」を区別できないのが問題の本体なので、
   * ここで既定値のトグルを添えてはいけない
   */
  it('操作できる設定項目を出さない', () => {
    render(<SettingsLoadError label='通知設定' onRetry={jest.fn()} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    // 再読み込み以外のボタンは置かない
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
