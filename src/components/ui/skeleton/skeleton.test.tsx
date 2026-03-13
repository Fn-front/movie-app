import { render } from '@testing-library/react';

import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('デフォルトのtext variantでレンダリングされる', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('rect variantでレンダリングされる', () => {
    const { container } = render(<Skeleton variant='rect' />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('circle variantでレンダリングされる', () => {
    const { container } = render(<Skeleton variant='circle' />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('数値のwidthとheightをpxに変換する', () => {
    const { container } = render(<Skeleton width={100} height={50} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('50px');
  });

  it('文字列のwidthとheightをそのまま使用する', () => {
    const { container } = render(<Skeleton width='50%' height='2rem' />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('2rem');
  });

  it('カスタムclassNameが適用される', () => {
    const { container } = render(<Skeleton className='custom-class' />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('追加のstyleが適用される', () => {
    const { container } = render(
      <Skeleton style={{ borderRadius: '8px' }} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderRadius).toBe('8px');
  });
});
