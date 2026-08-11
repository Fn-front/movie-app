import { render, screen } from '@testing-library/react';

import { Footer } from './footer';

// --- Tests ---

describe('Footer', () => {
  it('コピーライトが表示される', () => {
    render(<Footer />);
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Movie App`),
    ).toBeInTheDocument();
  });

  it('カスタムコピーライトが表示される', () => {
    render(<Footer copyright='© 2026 Test' />);
    expect(screen.getByText('© 2026 Test')).toBeInTheDocument();
  });

  it('リンクが表示される', () => {
    render(
      <Footer
        links={[
          { label: '利用規約', href: '/terms' },
          { label: 'プライバシー', href: '/privacy' },
        ]}
      />,
    );
    expect(screen.getByText('利用規約')).toBeInTheDocument();
    expect(screen.getByText('プライバシー')).toBeInTheDocument();
  });

  it('TMDbロゴが表示される', () => {
    render(<Footer />);
    const logo = screen.getByAltText('TMDB');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src');
  });

  it('TMDbアトリビューション文言が表示される', () => {
    render(<Footer />);
    expect(
      screen.getByText(
        'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      ),
    ).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(<Footer className='custom-class' />);
    const footer = container.querySelector('footer');
    expect(footer?.className).toContain('custom-class');
  });

  it('境界値: links が空配列の場合、nav 要素が描画されない', () => {
    const { container } = render(<Footer links={[]} />);
    expect(container.querySelector('nav')).not.toBeInTheDocument();
  });

  it('境界値: links が未指定の場合も nav 要素が描画されない', () => {
    const { container } = render(<Footer />);
    expect(container.querySelector('nav')).not.toBeInTheDocument();
  });

  it('children が渡されると custom 領域として描画される', () => {
    render(
      <Footer>
        <span data-testid='custom-content'>カスタム</span>
      </Footer>,
    );
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
  });
});
