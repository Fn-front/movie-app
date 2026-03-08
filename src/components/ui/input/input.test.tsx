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
});
