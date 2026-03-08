import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Badge } from './badge';

// --- Tests ---

describe('Badge', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    render(<Badge>テスト</Badge>);
    expect(screen.getByText('テスト')).toBeInTheDocument();
  });

  it('childrenが正しく表示される', () => {
    render(<Badge>アクション</Badge>);
    expect(screen.getByText('アクション')).toBeInTheDocument();
  });

  it('削除ボタンが表示される', () => {
    const handleRemove = jest.fn();
    render(<Badge onRemove={handleRemove}>フィルター</Badge>);
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('削除ボタンをクリックするとonRemoveが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleRemove = jest.fn();
    render(<Badge onRemove={handleRemove}>フィルター</Badge>);
    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('onRemoveがない場合は削除ボタンが表示されない', () => {
    render(<Badge>テスト</Badge>);
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Badge className='custom'>テスト</Badge>);
    // getByTextは内側のspanを返すので、親のspan(ルート)まで辿る
    const inner = screen.getByText('テスト');
    const root = inner.parentElement;
    expect(root?.className).toContain('custom');
  });
});
