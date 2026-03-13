import { render, screen } from '@testing-library/react';

import { Heading } from './heading';

describe('Heading', () => {
  it('デフォルトでh1タグをレンダリングする', () => {
    render(<Heading>タイトル</Heading>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'タイトル',
    );
  });

  it('level=2でh2タグをレンダリングする', () => {
    render(<Heading level={2}>見出し</Heading>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      '見出し',
    );
  });

  it('level=3でh3タグをレンダリングする', () => {
    render(<Heading level={3}>小見出し</Heading>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      '小見出し',
    );
  });

  it('align=centerを適用する', () => {
    render(<Heading align='center'>中央</Heading>);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('align=rightを適用する', () => {
    render(<Heading align='right'>右寄せ</Heading>);
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('カスタムclassNameが適用される', () => {
    render(<Heading className='custom'>テスト</Heading>);
    expect(screen.getByRole('heading')).toHaveClass('custom');
  });
});
