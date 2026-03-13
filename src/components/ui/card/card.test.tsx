import { render, screen } from '@testing-library/react';

import { Card, CardHeader, CardBody, CardFooter } from './card';

// --- Tests ---

describe('Card', () => {
  it('子要素が表示される', () => {
    render(<Card>カードの内容</Card>);
    expect(screen.getByText('カードの内容')).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(<Card className='custom'>内容</Card>);
    expect(container.firstChild).toHaveClass('custom');
  });
});

describe('CardHeader', () => {
  it('子要素が表示される', () => {
    render(<CardHeader>ヘッダー</CardHeader>);
    expect(screen.getByText('ヘッダー')).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(
      <CardHeader className='custom-header'>ヘッダー</CardHeader>,
    );
    expect(container.firstChild).toHaveClass('custom-header');
  });
});

describe('CardBody', () => {
  it('子要素が表示される', () => {
    render(<CardBody>ボディ</CardBody>);
    expect(screen.getByText('ボディ')).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(
      <CardBody className='custom-body'>ボディ</CardBody>,
    );
    expect(container.firstChild).toHaveClass('custom-body');
  });
});

describe('CardFooter', () => {
  it('子要素が表示される', () => {
    render(<CardFooter>フッター</CardFooter>);
    expect(screen.getByText('フッター')).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    const { container } = render(
      <CardFooter className='custom-footer'>フッター</CardFooter>,
    );
    expect(container.firstChild).toHaveClass('custom-footer');
  });
});

describe('Card バリアントprops', () => {
  it('noBorder=trueの場合対応するクラスが適用される', () => {
    const { container } = render(<Card noBorder>内容</Card>);
    expect(container.firstChild).toHaveClass('c_card__no_border');
  });

  it('noShadow=trueの場合対応するクラスが適用される', () => {
    const { container } = render(<Card noShadow>内容</Card>);
    expect(container.firstChild).toHaveClass('c_card__no_shadow');
  });
});

describe('Card composition', () => {
  it('全サブコンポーネントが組み合わせて表示される', () => {
    render(
      <Card>
        <CardHeader>タイトル</CardHeader>
        <CardBody>コンテンツ</CardBody>
        <CardFooter>アクション</CardFooter>
      </Card>,
    );
    expect(screen.getByText('タイトル')).toBeInTheDocument();
    expect(screen.getByText('コンテンツ')).toBeInTheDocument();
    expect(screen.getByText('アクション')).toBeInTheDocument();
  });
});
