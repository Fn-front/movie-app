import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Input } from './input';

// --- Tests ---

describe('Input', () => {
  it('ラベルが表示される', () => {
    render(<Input label='メールアドレス' />);
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
  });

  it('ラベルなしでaria-labelが設定できる', () => {
    render(<Input aria-label='検索' />);
    expect(screen.getByRole('textbox', { name: '検索' })).toBeInTheDocument();
  });

  it('入力ができる', async () => {
    const user = userEvent.setup();
    render(<Input label='名前' />);

    const input = screen.getByLabelText('名前');
    await user.type(input, 'テスト');
    expect(input).toHaveValue('テスト');
  });

  it('エラーメッセージが表示される', () => {
    render(<Input label='メール' error='必須項目です' />);
    expect(screen.getByRole('alert')).toHaveTextContent('必須項目です');
  });

  it('エラー時にaria-invalidがtrueになる', () => {
    render(<Input label='メール' error='エラー' />);
    expect(screen.getByLabelText('メール')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('ヘルパーテキストが表示される', () => {
    render(<Input label='パスワード' helperText='8文字以上' />);
    expect(screen.getByText('8文字以上')).toBeInTheDocument();
  });

  it('エラーがある場合はヘルパーテキストが非表示になる', () => {
    render(
      <Input label='パスワード' error='必須です' helperText='8文字以上' />,
    );
    expect(screen.queryByText('8文字以上')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('必須です');
  });

  it('disabled状態になる', () => {
    render(<Input label='入力' disabled />);
    expect(screen.getByLabelText('入力')).toBeDisabled();
  });

  it('placeholderが表示される', () => {
    render(<Input label='名前' placeholder='名前を入力' />);
    expect(screen.getByPlaceholderText('名前を入力')).toBeInTheDocument();
  });

  it('idプロップを指定した場合そのidが使用される', () => {
    render(<Input id='custom-id' label='名前' />);
    const input = screen.getByLabelText('名前');
    expect(input).toHaveAttribute('id', 'custom-id');
  });

  it('refが正しく転送される', () => {
    const ref = jest.fn();
    render(<Input label='名前' ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('左側アイコンが表示される', () => {
    render(<Input label='名前' leftIcon={<span data-testid='left-icon'>L</span>} />);
    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
  });

  it('右側アイコンが表示される', () => {
    render(<Input label='名前' rightIcon={<span data-testid='right-icon'>R</span>} />);
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('aria-labelとlabelの両方がない場合aria-labelがundefinedになる', () => {
    render(<Input placeholder='入力' />);
    const input = screen.getByPlaceholderText('入力');
    expect(input).not.toHaveAttribute('aria-label');
  });
});
