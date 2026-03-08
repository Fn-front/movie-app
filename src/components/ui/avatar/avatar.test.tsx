jest.mock('next/image', () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  };
  MockImage.displayName = 'MockImage';
  return { __esModule: true, default: MockImage };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { Avatar } from './avatar';

// --- Tests ---

describe('Avatar', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    render(<Avatar alt='ユーザー' />);
    expect(screen.getByRole('img', { name: 'ユーザー' })).toBeInTheDocument();
  });

  it('画像がない場合はフォールバック文字が表示される', () => {
    render(<Avatar alt='ユーザー' />);
    expect(screen.getByText('ユ')).toBeInTheDocument();
  });

  it('fallback propが指定されている場合はその文字が表示される', () => {
    render(<Avatar alt='ユーザー' fallback='A' />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('src指定時に画像が表示される', () => {
    render(<Avatar src='/test.jpg' alt='ユーザー' />);
    const img = screen.getByAltText('ユーザー');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/test.jpg');
  });

  it('画像エラー時にフォールバックが表示される', () => {
    render(<Avatar src='/broken.jpg' alt='ユーザー' />);
    const img = screen.getByAltText('ユーザー');
    fireEvent.error(img);
    expect(screen.getByText('ユ')).toBeInTheDocument();
  });

  it('sizeがsmの場合に正しいサイズで画像が表示される', () => {
    render(<Avatar src='/test.jpg' alt='ユーザー' size='sm' />);
    const img = screen.getByAltText('ユーザー');
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
  });

  it('sizeがlgの場合に正しいサイズで画像が表示される', () => {
    render(<Avatar src='/test.jpg' alt='ユーザー' size='lg' />);
    const img = screen.getByAltText('ユーザー');
    expect(img).toHaveAttribute('width', '64');
    expect(img).toHaveAttribute('height', '64');
  });

  it('aria-labelがalt textで設定される', () => {
    render(<Avatar alt='テストユーザー' />);
    expect(screen.getByRole('img', { name: 'テストユーザー' })).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Avatar alt='ユーザー' className='custom' />);
    expect(screen.getByRole('img').className).toContain('custom');
  });

  it('srcがnullの場合はフォールバックが表示される', () => {
    render(<Avatar src={null} alt='ユーザー' />);
    expect(screen.getByText('ユ')).toBeInTheDocument();
  });
});
