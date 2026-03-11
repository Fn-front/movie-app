/**
 * WatchlistItemコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistItem } from './watchlistItem';
import type { WatchlistItem as WatchlistItemType } from '@/lib/api/watchlist/watchlist';

// --- Helpers ---

const createMockItem = (
  overrides: Partial<WatchlistItemType> = {},
): WatchlistItemType => ({
  id: 'wl-1',
  tmdb_movie_id: 123,
  title: 'テスト映画',
  poster_path: '/test.jpg',
  release_date: '2026-03-01',
  added_at: '2026-03-10T00:00:00Z',
  ...overrides,
});

// --- Tests ---

describe('WatchlistItem', () => {
  it('ポスター・タイトル・公開日・削除ボタンが表示される', () => {
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.getByAltText('テスト映画のポスター')).toBeInTheDocument();
    expect(screen.getByText('テスト映画')).toBeInTheDocument();
    expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'テスト映画をウォッチリストから削除',
      }),
    ).toBeInTheDocument();
  });

  it('公開日がnullの場合は公開日が表示されない', () => {
    const item = createMockItem({ release_date: null });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.getByText('テスト映画')).toBeInTheDocument();
    expect(screen.queryByText(/\d{4}年/)).not.toBeInTheDocument();
  });

  it('アイテムクリック時にonClickが映画IDで呼ばれる', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const item = createMockItem({ tmdb_movie_id: 456 });
    render(
      <WatchlistItem item={item} onClick={onClick} onDelete={jest.fn()} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'テスト映画の詳細を表示' }),
    );
    expect(onClick).toHaveBeenCalledWith(456);
  });

  it('削除ボタンクリック時にonDeleteが呼ばれonClickは発火しない', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const onDelete = jest.fn();
    const item = createMockItem({ id: 'wl-99' });
    render(<WatchlistItem item={item} onClick={onClick} onDelete={onDelete} />);

    await user.click(
      screen.getByRole('button', {
        name: 'テスト映画をウォッチリストから削除',
      }),
    );

    expect(onDelete).toHaveBeenCalledWith('wl-99');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ポスター画像なし時にフォールバック表示', () => {
    const item = createMockItem({ poster_path: null });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('🎬')).toBeInTheDocument();
  });

  it('aria-label属性が正しく設定される', () => {
    const item = createMockItem({ title: '映画タイトル' });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: '映画タイトルの詳細を表示' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '映画タイトルをウォッチリストから削除',
      }),
    ).toBeInTheDocument();
  });

  it('Enterキーでアイテムのクリックが発火する', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={onClick} onDelete={jest.fn()} />,
    );

    const itemButton = screen.getByRole('button', {
      name: 'テスト映画の詳細を表示',
    });
    itemButton.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledWith(123);
  });

  it('削除ボタンのEnterキーでonDeleteが呼ばれonClickは発火しない', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const onDelete = jest.fn();
    const item = createMockItem({ id: 'wl-key' });
    render(<WatchlistItem item={item} onClick={onClick} onDelete={onDelete} />);

    const deleteButton = screen.getByRole('button', {
      name: 'テスト映画をウォッチリストから削除',
    });
    deleteButton.focus();
    await user.keyboard('{Enter}');

    expect(onDelete).toHaveBeenCalledWith('wl-key');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Spaceキーでアイテムのクリックが発火する', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={onClick} onDelete={jest.fn()} />,
    );

    const itemButton = screen.getByRole('button', {
      name: 'テスト映画の詳細を表示',
    });
    itemButton.focus();
    await user.keyboard('{ }');
    expect(onClick).toHaveBeenCalledWith(123);
  });

  it('削除ボタンのSpaceキーでonDeleteが呼ばれる', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    const item = createMockItem({ id: 'wl-space' });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={onDelete} />,
    );

    const deleteButton = screen.getByRole('button', {
      name: 'テスト映画をウォッチリストから削除',
    });
    deleteButton.focus();
    await user.keyboard('{ }');

    expect(onDelete).toHaveBeenCalledWith('wl-space');
  });

  it('他のキーではアイテムのクリックは発火しない', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    const item = createMockItem();
    render(
      <WatchlistItem item={item} onClick={onClick} onDelete={jest.fn()} />,
    );

    const itemButton = screen.getByRole('button', {
      name: 'テスト映画の詳細を表示',
    });
    itemButton.focus();
    await user.keyboard('{Tab}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ポスター画像のsrcが正しく生成される', () => {
    const item = createMockItem({ poster_path: '/abc.jpg' });
    render(
      <WatchlistItem item={item} onClick={jest.fn()} onDelete={jest.fn()} />,
    );

    const img = screen.getByAltText('テスト映画のポスター');
    expect(img).toHaveAttribute('src');
    expect(img.getAttribute('src')).toContain('abc.jpg');
  });
});
