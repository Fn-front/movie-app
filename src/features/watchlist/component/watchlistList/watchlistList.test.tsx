/**
 * WatchlistListコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistList } from './watchlistList';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';

// --- Mocks ---

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: ({ count }: { count: number }) => (
    <div data-testid='movie-tile-skeleton'>skeleton x {count}</div>
  ),
}));

// --- Helpers ---

const createMockItems = (count: number): WatchlistItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `wl-${i}`,
    tmdb_movie_id: 100 + i,
    title: `映画${i}`,
    poster_path: i % 2 === 0 ? `/poster${i}.jpg` : null,
    release_date: i % 3 === 0 ? '2026-03-01' : null,
    added_at: `2026-03-${String(10 - i).padStart(2, '0')}T00:00:00Z`,
    watched_at: null,
  }));

// --- Tests ---

describe('WatchlistList', () => {
  it('ローディング中にスケルトンが表示される', () => {
    render(<WatchlistList watchlist={[]} isLoading={true} />);

    expect(screen.getByTestId('movie-tile-skeleton')).toBeInTheDocument();
  });

  it('空状態メッセージが表示される', () => {
    render(<WatchlistList watchlist={[]} isLoading={false} />);

    expect(
      screen.getByText('ウォッチリストに映画を追加しましょう'),
    ).toBeInTheDocument();
  });

  it('複数件のアイテムが表示される', () => {
    render(<WatchlistList watchlist={createMockItems(3)} isLoading={false} />);

    expect(screen.getByText('映画0')).toBeInTheDocument();
    expect(screen.getByText('映画1')).toBeInTheDocument();
    expect(screen.getByText('映画2')).toBeInTheDocument();
  });

  it('ポスター画像がある場合はImageが表示される', () => {
    render(<WatchlistList watchlist={createMockItems(1)} isLoading={false} />);

    expect(screen.getByAltText('映画0のポスター')).toBeInTheDocument();
  });

  it('ポスター画像がない場合はNo Imageが表示される', () => {
    const items = createMockItems(2);
    render(<WatchlistList watchlist={[items[1]]} isLoading={false} />);

    expect(screen.getByText('No Image')).toBeInTheDocument();
  });

  it('公開日がある場合は表示される', () => {
    render(<WatchlistList watchlist={createMockItems(1)} isLoading={false} />);

    expect(screen.getByText('2026-03-01')).toBeInTheDocument();
  });

  it('onClickが渡された場合、タイルクリックでコールバックが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={handleClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: '映画0' }));
    expect(handleClick).toHaveBeenCalledWith(100);
  });

  it('onDeleteが渡された場合、削除ボタンが表示される', async () => {
    const user = userEvent.setup();
    const handleDelete = jest.fn();
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={jest.fn()}
        onDelete={handleDelete}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: '映画0をウォッチリストから削除',
      }),
    );
    expect(handleDelete).toHaveBeenCalledWith('wl-0');
  });

  it('キーボード操作でタイルクリックが動作する', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();
    render(
      <WatchlistList
        watchlist={createMockItems(1)}
        isLoading={false}
        onClick={handleClick}
      />,
    );

    const tile = screen.getByRole('button', { name: '映画0' });
    tile.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledWith(100);
  });

  describe('視聴済み', () => {
    it('onWatchedToggleが渡された場合、視聴済みボタンが表示される', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      ).toBeInTheDocument();
    });

    it('onWatchedToggleが無い場合は視聴済みボタンを出さない', () => {
      render(
        <WatchlistList watchlist={createMockItems(1)} isLoading={false} />,
      );

      expect(
        screen.queryByRole('button', { name: /視聴済みにする/ }),
      ).not.toBeInTheDocument();
    });

    it('視聴済みボタンのクリックでidと視聴済みフラグを渡す', async () => {
      const user = userEvent.setup();
      const handleWatchedToggle = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={handleWatchedToggle}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      );

      expect(handleWatchedToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wl-0' }),
        true,
      );
    });

    it('視聴済みのアイテムはバッジと解除ボタンになる', () => {
      const items = createMockItems(1).map((item) => ({
        ...item,
        watched_at: '2026-03-01T00:00:00Z',
      }));

      render(
        <WatchlistList
          watchlist={items}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(screen.getByText('視聴済み')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '映画0を未視聴に戻す' }),
      ).toBeInTheDocument();
    });

    it('視聴済みのアイテムをクリックすると解除として渡す', async () => {
      const user = userEvent.setup();
      const handleWatchedToggle = jest.fn();
      const items = createMockItems(1).map((item) => ({
        ...item,
        watched_at: '2026-03-01T00:00:00Z',
      }));

      render(
        <WatchlistList
          watchlist={items}
          isLoading={false}
          onWatchedToggle={handleWatchedToggle}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: '映画0を未視聴に戻す' }),
      );

      expect(handleWatchedToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wl-0' }),
        false,
      );
    });

    it('未視聴のアイテムにはバッジを出さない', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
        />,
      );

      expect(screen.queryByText('視聴済み')).not.toBeInTheDocument();
    });

    it('視聴済みボタンのクリックでタイルのクリックは発火しない', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onClick={handleClick}
          onWatchedToggle={jest.fn()}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      );

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('キーボード操作で視聴済みを切り替えられる', async () => {
      const user = userEvent.setup();
      const handleWatchedToggle = jest.fn();
      const handleClick = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onClick={handleClick}
          onWatchedToggle={handleWatchedToggle}
        />,
      );

      screen.getByRole('button', { name: '映画0を視聴済みにする' }).focus();
      await user.keyboard('{Enter}');

      // keydown で preventDefault するため、クリックとの二重発火にならない
      expect(handleWatchedToggle).toHaveBeenCalledTimes(1);
      // タイル本体の詳細モーダルは開かない
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('キーボード操作で削除できる', async () => {
      const user = userEvent.setup();
      const handleDelete = jest.fn();
      const handleClick = jest.fn();

      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onClick={handleClick}
          onDelete={handleDelete}
        />,
      );

      screen
        .getByRole('button', { name: '映画0をウォッチリストから削除' })
        .focus();
      await user.keyboard('{Enter}');

      expect(handleDelete).toHaveBeenCalledTimes(1);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('更新中は視聴済みボタンを無効化する', () => {
      render(
        <WatchlistList
          watchlist={createMockItems(1)}
          isLoading={false}
          onWatchedToggle={jest.fn()}
          isWatchedUpdating
        />,
      );

      expect(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      ).toBeDisabled();
    });
  });
});
