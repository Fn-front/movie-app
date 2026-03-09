jest.mock('next/link', () => {
  const MockLink = ({
    children,
    href,
    ...props
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  MockLink.displayName = 'MockLink';
  return { __esModule: true, default: MockLink };
});

jest.mock('next/image', () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt='' {...props} />;
  };
  MockImage.displayName = 'MockImage';
  return { __esModule: true, default: MockImage };
});

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

import React from 'react';
import { render, screen } from '@testing-library/react';

import { AppLayout } from './appLayout';

// --- Tests ---

describe('AppLayout', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('childrenがmain要素内に表示される', () => {
    render(<AppLayout>テストコンテンツ</AppLayout>);
    expect(screen.getByRole('main')).toHaveTextContent('テストコンテンツ');
  });

  it('Headerが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('Footerが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('デフォルトでサイドバーが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('showSidebar=falseでサイドバーが非表示になる', () => {
    render(<AppLayout showSidebar={false}>コンテンツ</AppLayout>);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('ロゴリンクが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('link', { name: 'Movie App' })).toBeInTheDocument();
  });
});
