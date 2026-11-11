import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { STORAGE_KEYS } from '@/constants';
import { ViewModeToggle } from './viewModeToggle';

describe('ViewModeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('グリッド表示のときは「リスト表示に切り替え」を出す', () => {
    render(<ViewModeToggle />);

    expect(
      screen.getByRole('button', { name: 'リスト表示に切り替え' }),
    ).toBeInTheDocument();
  });

  it('押すとリスト表示へ切り替わり、ラベルが入れ替わる', async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle />);

    await user.click(
      screen.getByRole('button', { name: 'リスト表示に切り替え' }),
    );

    expect(
      screen.getByRole('button', { name: 'グリッド表示に切り替え' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEYS.MOVIE_VIEW_MODE)).toBe('list');
  });

  it('現在の表示モードを aria-pressed で伝える', async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle />);

    const button = screen.getByRole('button', {
      name: 'リスト表示に切り替え',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);

    expect(
      screen.getByRole('button', { name: 'グリッド表示に切り替え' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('保存済みがリストなら、その状態で表示される', () => {
    localStorage.setItem(STORAGE_KEYS.MOVIE_VIEW_MODE, 'list');

    render(<ViewModeToggle />);

    expect(
      screen.getByRole('button', { name: 'グリッド表示に切り替え' }),
    ).toBeInTheDocument();
  });
});
