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
});

describe('CardBody', () => {
  it('子要素が表示される', () => {
    render(<CardBody>ボディ</CardBody>);
    expect(screen.getByText('ボディ')).toBeInTheDocument();
  });
});

describe('CardFooter', () => {
  it('子要素が表示される', () => {
    render(<CardFooter>フッター</CardFooter>);
    expect(screen.getByText('フッター')).toBeInTheDocument();
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
