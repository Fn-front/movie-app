import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Textarea } from './textarea';

// --- Tests ---

describe('Textarea', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    render(<Textarea aria-label='テスト' />);
    expect(screen.getByRole('textbox', { name: 'テスト' })).toBeInTheDocument();
  });

  it('ラベルが表示される', () => {
    render(<Textarea label='レビュー' />);
    expect(screen.getByLabelText('レビュー')).toBeInTheDocument();
  });

  it('入力ができる', async () => {
    const user = userEvent.setup();
    render(<Textarea label='レビュー' />);
    const textarea = screen.getByLabelText('レビュー');
    await user.type(textarea, 'テスト入力');
    expect(textarea).toHaveValue('テスト入力');
  });

  it('エラーメッセージが表示される', () => {
    render(<Textarea label='レビュー' error='必須項目です' />);
    expect(screen.getByRole('alert')).toHaveTextContent('必須項目です');
  });

  it('エラー時にaria-invalidがtrueになる', () => {
    render(<Textarea label='レビュー' error='エラー' />);
    expect(screen.getByLabelText('レビュー')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('ヘルパーテキストが表示される', () => {
    render(<Textarea label='レビュー' helperText='500文字以内' />);
    expect(screen.getByText('500文字以内')).toBeInTheDocument();
  });

  it('エラーがある場合はヘルパーテキストが非表示になる', () => {
    render(
      <Textarea label='レビュー' error='必須です' helperText='500文字以内' />,
    );
    expect(screen.queryByText('500文字以内')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('必須です');
  });

  it('disabled状態になる', () => {
    render(<Textarea label='レビュー' disabled />);
    expect(screen.getByLabelText('レビュー')).toBeDisabled();
  });

  it('placeholderが表示される', () => {
    render(<Textarea label='レビュー' placeholder='感想を入力' />);
    expect(screen.getByPlaceholderText('感想を入力')).toBeInTheDocument();
  });

  it('文字数カウントが表示される', () => {
    render(
      <Textarea
        label='レビュー'
        value='テスト'
        onChange={jest.fn()}
        showCount
        maxLength={500}
      />,
    );
    expect(screen.getByText('3 / 500')).toBeInTheDocument();
  });

  it('aria-labelでラベルなしでも使用できる', () => {
    render(<Textarea aria-label='検索' />);
    expect(screen.getByRole('textbox', { name: '検索' })).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Textarea label='レビュー' className='custom' />);
    const textarea = screen.getByLabelText('レビュー');
    expect(textarea.closest('div')?.className).toContain('custom');
  });

  it('showCount=trueでmaxLengthがない場合は文字数カウントが表示されない', () => {
    render(
      <Textarea
        label='レビュー'
        value='テスト'
        onChange={jest.fn()}
        showCount
      />,
    );
    expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
  });

  it('refが正しく転送される', () => {
    const ref = jest.fn();
    render(<Textarea label='レビュー' ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLTextAreaElement));
  });

  it('valueが文字列でない場合に文字数が0になる', () => {
    render(
      <Textarea
        label='レビュー'
        showCount
        maxLength={500}
      />,
    );
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });
});
