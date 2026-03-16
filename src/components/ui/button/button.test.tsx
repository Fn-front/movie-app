import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Button } from './button';

// --- Tests ---

describe('Button', () => {
  it('テキストが表示される', () => {
    render(<Button>クリック</Button>);
    expect(
      screen.getByRole('button', { name: 'クリック' }),
    ).toBeInTheDocument();
  });

  it('デフォルトのtype属性がbuttonになる', () => {
    render(<Button>テスト</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('type属性がsubmitに設定できる', () => {
    render(<Button type='submit'>送信</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('クリックイベントが発火する', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(<Button onClick={handleClick}>クリック</Button>);
    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disabled状態でクリックが無効になる', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(
      <Button onClick={handleClick} disabled>
        クリック
      </Button>,
    );
    await user.click(screen.getByRole('button'));

    expect(handleClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('isLoading状態でdisabledになる', () => {
    render(<Button isLoading>クリック</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('isLoading状態でスピナーが表示される', () => {
    const { container } = render(<Button isLoading>クリック</Button>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('aria-labelが設定できる', () => {
    render(<Button aria-label='送信ボタン'>送信</Button>);
    expect(
      screen.getByRole('button', { name: '送信ボタン' }),
    ).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Button className='custom'>テスト</Button>);
    expect(screen.getByRole('button').className).toContain('custom');
  });

  it('アクセシビリティ違反がない', async () => {
    const { container } = render(<Button>クリック</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('disabled状態でアクセシビリティ違反がない', async () => {
    const { container } = render(<Button disabled>クリック</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
