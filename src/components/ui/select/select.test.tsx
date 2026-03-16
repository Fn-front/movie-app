import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Select } from './select';

// --- Tests ---

const options = [
  { label: 'アクション', value: 'action' },
  { label: 'コメディ', value: 'comedy' },
  { label: 'ドラマ', value: 'drama' },
];

describe('Select', () => {
  it('ラベルが表示される', () => {
    render(<Select label='ジャンル' options={options} />);
    expect(screen.getByText('ジャンル')).toBeInTheDocument();
  });

  it('aria-labelが設定できる', () => {
    render(<Select aria-label='ジャンル選択' options={options} />);
    expect(
      screen.getByRole('combobox', { name: 'ジャンル選択' }),
    ).toBeInTheDocument();
  });

  it('エラーメッセージが表示される', () => {
    render(<Select label='ジャンル' options={options} error='必須です' />);
    expect(screen.getByRole('alert')).toHaveTextContent('必須です');
  });

  it('エラー時にaria-invalidがtrueになる', () => {
    render(<Select label='ジャンル' options={options} error='エラー' />);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('ヘルパーテキストが表示される', () => {
    render(
      <Select
        label='ジャンル'
        options={options}
        helperText='1つ選択してください'
      />,
    );
    expect(screen.getByText('1つ選択してください')).toBeInTheDocument();
  });

  it('disabled状態になる', () => {
    render(<Select label='ジャンル' options={options} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('required時にアスタリスクが表示される', () => {
    render(<Select label='ジャンル' options={options} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('refが正しく転送される', () => {
    const ref = jest.fn();
    render(<Select label='ジャンル' options={options} ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('アクセシビリティ違反がない', async () => {
    const { container } = render(<Select label='ジャンル' options={options} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
