import { render, screen } from '@testing-library/react';

import { Loading } from './loading';

// --- Tests ---

describe('Loading', () => {
  it('スピナーが表示される', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('ラベルが表示される', () => {
    render(<Loading label='読み込み中...' />);
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('ラベルなしの場合はテキストが非表示', () => {
    render(<Loading />);
    expect(screen.queryByText(/.+/)).not.toBeInTheDocument();
  });

  it('aria-liveが設定される', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('fullScreen時にオーバーレイが表示される', () => {
    const { container } = render(<Loading fullScreen />);
    expect(container.querySelector('[class*="overlay"]')).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(<Loading className='custom' />);
    expect(container.firstChild).toHaveClass('custom');
  });
});
