/**
 * CalendarButtonコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CalendarButton } from './calendarButton';

describe('CalendarButton', () => {
  it('カレンダーボタンを表示する', () => {
    render(<CalendarButton onClick={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '公開カレンダーを開く' }),
    ).toBeInTheDocument();
    expect(screen.getByText('公開カレンダー')).toBeInTheDocument();
  });

  it('クリックでonClickが呼ばれる', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    render(<CalendarButton onClick={onClick} />);

    await user.click(
      screen.getByRole('button', { name: '公開カレンダーを開く' }),
    );

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
