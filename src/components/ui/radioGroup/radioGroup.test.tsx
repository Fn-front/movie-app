/**
 * RadioGroup コンポーネントのテスト
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { RadioGroup } from './radioGroup';

const defaultOptions = [
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
];

describe('RadioGroup', () => {
  it('全ての選択肢がラジオボタンとして表示される', () => {
    render(
      <RadioGroup
        options={defaultOptions}
        value='light'
        onValueChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'ライト' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ダーク' })).toBeInTheDocument();
  });

  it('value に一致する選択肢が checked=true になる', () => {
    render(
      <RadioGroup
        options={defaultOptions}
        value='dark'
        onValueChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'ダーク' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'ライト' })).not.toBeChecked();
  });

  it('選択肢クリックで onValueChange が呼ばれる', () => {
    const onValueChange = jest.fn();
    render(
      <RadioGroup
        options={defaultOptions}
        value='light'
        onValueChange={onValueChange}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'ダーク' }));
    expect(onValueChange).toHaveBeenCalledWith('dark');
  });

  it('aria-label が radiogroup に設定される', () => {
    render(
      <RadioGroup
        options={defaultOptions}
        value='light'
        onValueChange={jest.fn()}
        aria-label='テーマを選択'
      />,
    );

    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-label',
      'テーマを選択',
    );
  });

  it('label クリックでも onValueChange が呼ばれる（label と radio の紐付け）', () => {
    const onValueChange = jest.fn();
    render(
      <RadioGroup
        options={defaultOptions}
        value='light'
        onValueChange={onValueChange}
      />,
    );

    // label element を name でクリック（htmlFor で radio に紐付いている）
    fireEvent.click(screen.getByText('ダーク'));
    expect(onValueChange).toHaveBeenCalledWith('dark');
  });

  it('境界値: options が空配列でもエラーにならない', () => {
    const { container } = render(
      <RadioGroup options={[]} value='' onValueChange={jest.fn()} />,
    );

    expect(container.querySelector('[role="radiogroup"]')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('境界値: options が1件でも表示される', () => {
    render(
      <RadioGroup
        options={[{ label: '唯一の選択肢', value: 'only' }]}
        value='only'
        onValueChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: '唯一の選択肢' })).toBeChecked();
  });

  it('カスタム className が root に適用される', () => {
    const { container } = render(
      <RadioGroup
        options={defaultOptions}
        value='light'
        onValueChange={jest.fn()}
        className='custom-class'
      />,
    );

    const root = container.querySelector('[role="radiogroup"]');
    expect(root).toHaveClass('custom-class');
  });
});
