/**
 * TmdbDeletedNotice コンポーネントのテスト（#433 案D）
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SOFT_DELETED_LIST_RETENTION_HOURS } from '@/constants/cleanup';

import { getDaysUntilRemoval, TmdbDeletedNotice } from './tmdbDeletedNotice';

/** N日前の ISO 文字列 */
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('getDaysUntilRemoval', () => {
  it('検知直後は保持期間いっぱいの日数を返す', () => {
    expect(getDaysUntilRemoval(daysAgo(0))).toBe(
      SOFT_DELETED_LIST_RETENTION_HOURS / 24,
    );
  });

  it('経過したぶんだけ減る', () => {
    expect(getDaysUntilRemoval(daysAgo(10))).toBe(
      SOFT_DELETED_LIST_RETENTION_HOURS / 24 - 10,
    );
  });

  /**
   * ⚠️ 0 や負数を返さない。
   *
   * 掃除は日次 CRON なので、期限を過ぎても次の実行まで行は残る。
   * 「あと0日」は「もう消えた」と読めてしまう。
   */
  it.each([
    ['ちょうど期限', SOFT_DELETED_LIST_RETENTION_HOURS / 24],
    ['期限を大きく過ぎた', 999],
  ])('%s でも1日以上を返す', (_label, elapsed) => {
    expect(getDaysUntilRemoval(daysAgo(elapsed))).toBe(1);
  });
});

describe('TmdbDeletedNotice', () => {
  const setup = (overrides: Record<string, unknown> = {}) => {
    const onRemove = jest.fn();
    render(
      <TmdbDeletedNotice
        tmdbDeletedAt={daysAgo(5)}
        onRemove={onRemove}
        movieTitle='ある映画'
        {...overrides}
      />,
    );
    return { onRemove };
  };

  it('削除されたことと残り日数を知らせる', () => {
    setup();

    expect(screen.getByText('TMDbから削除されました')).toBeInTheDocument();
    expect(
      screen.getByText(
        `あと${SOFT_DELETED_LIST_RETENTION_HOURS / 24 - 5}日で消えます`,
      ),
    ).toBeInTheDocument();
  });

  /**
   * ⚠️ `alert` にしない。一覧を開いた時点で既にそこにある情報で、
   * 操作の結果ではないため割り込みが強すぎる。
   */
  it('status ロールで知らせる', () => {
    setup();

    expect(screen.getByRole('status')).toHaveTextContent(
      'TMDbから削除されました',
    );
  });

  it('削除ボタンのアクセシブルネームに作品名が入る', () => {
    setup();

    expect(
      screen.getByRole('button', { name: 'ある映画を一覧から削除' }),
    ).toBeInTheDocument();
  });

  it('削除ボタンを押すとコールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const { onRemove } = setup();

    await user.click(screen.getByRole('button'));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('処理中は削除ボタンを無効化する', async () => {
    const user = userEvent.setup();
    const { onRemove } = setup({ disabled: true });

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onRemove).not.toHaveBeenCalled();
  });
});
