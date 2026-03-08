import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Checkbox } from './checkbox';

// --- Tests ---

describe('Checkbox', () => {
  it('ラベルが表示される', () => {
    render(<Checkbox label='利用規約に同意する' />);
    expect(screen.getByText('利用規約に同意する')).toBeInTheDocument();
  });

  it('チェック状態が反映される', () => {
    render(
      <Checkbox label='テスト' checked={true} onCheckedChange={jest.fn()} />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  it('未チェック状態が反映される', () => {
    render(
      <Checkbox label='テスト' checked={false} onCheckedChange={jest.fn()} />,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  });

  it('クリックでonCheckedChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(
      <Checkbox
        label='テスト'
        checked={false}
        onCheckedChange={handleChange}
      />,
    );
    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('disabled状態でクリックが無効になる', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(
      <Checkbox
        label='テスト'
        checked={false}
        onCheckedChange={handleChange}
        disabled
      />,
    );
    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('required時にアスタリスクが表示される', () => {
    render(<Checkbox label='必須項目' required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('aria-labelが設定できる', () => {
    render(<Checkbox aria-label='同意する' />);
    expect(
      screen.getByRole('checkbox', { name: '同意する' }),
    ).toBeInTheDocument();
  });
});
