import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Pagination } from './pagination';

// --- Tests ---

describe('Pagination', () => {
  it('デフォルトpropsでレンダリングされる', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    expect(
      screen.getByRole('navigation', { name: 'ページネーション' }),
    ).toBeInTheDocument();
  });

  it('totalPagesが1以下の場合はレンダリングされない', () => {
    const handlePageChange = jest.fn();
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={1}
        onPageChange={handlePageChange}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('ページ番号ボタンが表示される', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={handlePageChange}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'ページ 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ページ 2' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ページ 3' }),
    ).toBeInTheDocument();
  });

  it('現在のページにaria-current="page"が設定される', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'ページ 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('最初のページでは「最初のページへ」と「前のページへ」が無効になる', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    expect(
      screen.getByRole('button', { name: '最初のページへ' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: '前のページへ' })).toBeDisabled();
  });

  it('最後のページでは「次のページへ」と「最後のページへ」が無効になる', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={5}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    expect(screen.getByRole('button', { name: '次のページへ' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '最後のページへ' }),
    ).toBeDisabled();
  });

  it('ページ番号をクリックするとonPageChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'ページ 3' }));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('「次のページへ」をクリックすると次のページに移動する', async () => {
    const user = userEvent.setup();
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '次のページへ' }));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('「前のページへ」をクリックすると前のページに移動する', async () => {
    const user = userEvent.setup();
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '前のページへ' }));
    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('「最初のページへ」をクリックすると1ページ目に移動する', async () => {
    const user = userEvent.setup();
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '最初のページへ' }));
    expect(handlePageChange).toHaveBeenCalledWith(1);
  });

  it('「最後のページへ」をクリックすると最終ページに移動する', async () => {
    const user = userEvent.setup();
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '最後のページへ' }));
    expect(handlePageChange).toHaveBeenCalledWith(5);
  });

  it('現在のページをクリックしてもonPageChangeが呼ばれない', async () => {
    const user = userEvent.setup();
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'ページ 2' }));
    expect(handlePageChange).not.toHaveBeenCalled();
  });

  it('多数のページで省略記号が表示される', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={5}
        totalPages={10}
        onPageChange={handlePageChange}
      />,
    );
    const ellipses = screen.getAllByText('...');
    expect(ellipses.length).toBeGreaterThanOrEqual(1);
  });

  it('カスタムクラス名が適用される', () => {
    const handlePageChange = jest.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={handlePageChange}
        className='custom'
      />,
    );
    expect(screen.getByRole('navigation').className).toContain('custom');
  });
});
