import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ARIA_LABELS, STORAGE_KEYS } from '@/constants';
import { ViewModeToggle } from './viewModeToggle';

describe('ViewModeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const getToggle = () =>
    screen.getByRole('button', { name: ARIA_LABELS.LIST_VIEW });

  it('グリッド表示のときは押されていない状態で出る', () => {
    render(<ViewModeToggle />);

    expect(getToggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('押すとリスト表示へ切り替わり、保存される', async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle />);

    await user.click(getToggle());

    expect(getToggle()).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(STORAGE_KEYS.MOVIE_VIEW_MODE)).toBe('list');
  });

  // 往復できないと「リストにしたら戻せない」片道トグルになる
  it('もう一度押すとグリッドへ戻る', async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle />);

    await user.click(getToggle());
    await user.click(getToggle());

    expect(getToggle()).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(STORAGE_KEYS.MOVIE_VIEW_MODE)).toBe('grid');
  });

  // ラベルを状態で入れ替えると aria-pressed と意味が衝突する
  // （リスト表示中に「グリッド表示に切り替え・オン」と読まれる）
  it('ラベルは状態によらず変わらない', async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle />);

    await user.click(getToggle());

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(getToggle()).toHaveAccessibleName(ARIA_LABELS.LIST_VIEW);
  });

  it('保存済みがリストなら、その状態で表示される', () => {
    localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

    render(<ViewModeToggle />);

    expect(getToggle()).toHaveAttribute('aria-pressed', 'true');
  });

  it('キーボードで到達して操作できる', async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle />);

    await user.tab();
    expect(getToggle()).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(getToggle()).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard(' ');
    expect(getToggle()).toHaveAttribute('aria-pressed', 'false');
  });
});
