import { render, screen, fireEvent } from '@testing-library/react';

import { MovieTile } from './movieTile';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

// --- Helpers ---

const createMockMovie = (
  overrides?: Partial<MovieCacheItem>,
): MovieCacheItem => ({
  id: 1,
  title: 'テスト映画',
  poster_path: '/test.jpg',
  backdrop_path: null,
  release_date: '2026-03-01',
  overview: 'テスト概要',
  vote_average: 7.5,
  popularity: 100,
  genre_ids: [28, 12],
  release_type: 'theatrical',
  is_revival: false,
  ...overrides,
});

const genres: Record<number, string> = {
  28: 'アクション',
  12: 'アドベンチャー',
  35: 'コメディ',
};

// --- Tests ---

describe('MovieTile', () => {
  describe('表示', () => {
    it('映画タイトルが表示される', () => {
      render(<MovieTile movie={createMockMovie()} genres={genres} />);
      expect(screen.getByText('テスト映画')).toBeInTheDocument();
    });

    it('ポスター画像が表示される', () => {
      render(<MovieTile movie={createMockMovie()} genres={genres} />);
      const img = screen.getByAltText('テスト映画のポスター');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', expect.stringContaining('test.jpg'));
    });

    it('poster_pathがnullの場合No Imageが表示される', () => {
      render(<MovieTile movie={createMockMovie({ poster_path: null })} />);
      expect(screen.getByText('No Image')).toBeInTheDocument();
    });

    it('評価が表示される', () => {
      render(<MovieTile movie={createMockMovie({ vote_average: 7.5 })} />);
      expect(screen.getByText('7.5')).toBeInTheDocument();
    });

    it('評価が0の場合表示されない', () => {
      const { container } = render(
        <MovieTile movie={createMockMovie({ vote_average: 0 })} />,
      );
      expect(
        container.querySelector('.c_movie_tile__rating'),
      ).not.toBeInTheDocument();
    });

    it('評価がnullの場合表示されない', () => {
      const { container } = render(
        <MovieTile movie={createMockMovie({ vote_average: null })} />,
      );
      expect(
        container.querySelector('.c_movie_tile__rating'),
      ).not.toBeInTheDocument();
    });

    it('リバイバルバッジが表示される', () => {
      render(
        <MovieTile
          movie={createMockMovie({ is_revival: true })}
          genres={genres}
        />,
      );
      expect(screen.getByText('リバイバル')).toBeInTheDocument();
    });

    it('リバイバルでない場合バッジが表示されない', () => {
      render(<MovieTile movie={createMockMovie({ is_revival: false })} />);
      expect(screen.queryByText('リバイバル')).not.toBeInTheDocument();
    });

    it('ジャンル名が最大2つ表示される', () => {
      render(
        <MovieTile
          movie={createMockMovie({ genre_ids: [28, 12, 35] })}
          genres={genres}
        />,
      );
      expect(screen.getByText('アクション')).toBeInTheDocument();
      expect(screen.getByText('アドベンチャー')).toBeInTheDocument();
      expect(screen.queryByText('コメディ')).not.toBeInTheDocument();
    });

    it('genresが未指定の場合ジャンルが表示されない', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(screen.queryByText('アクション')).not.toBeInTheDocument();
    });

    it('genre_idsが空の場合ジャンルが表示されない', () => {
      render(
        <MovieTile
          movie={createMockMovie({ genre_ids: [] })}
          genres={genres}
        />,
      );
      expect(screen.queryByText('アクション')).not.toBeInTheDocument();
    });

    it('genre_idsがnullの場合ジャンルが表示されない', () => {
      render(
        <MovieTile
          movie={createMockMovie({ genre_ids: null })}
          genres={genres}
        />,
      );
      expect(screen.queryByText('アクション')).not.toBeInTheDocument();
    });

    it('公開日がフォーマットされて表示される', () => {
      render(
        <MovieTile movie={createMockMovie({ release_date: '2026-03-01' })} />,
      );
      expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
    });

    it('公開日がnullの場合表示されない', () => {
      render(<MovieTile movie={createMockMovie({ release_date: null })} />);
      expect(screen.queryByText(/\d{4}年/)).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-labelが設定される', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(
        screen.getByRole('button', { name: 'テスト映画の詳細を表示' }),
      ).toBeInTheDocument();
    });

    it('tabIndex=0が設定される', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });
  });

  describe('インタラクション', () => {
    it('クリック時にonClickが呼ばれる', () => {
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('Enterキーでクリックが発火する', () => {
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('Spaceキーでクリックが発火する', () => {
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('他のキーではonClickが呼ばれない', () => {
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
      expect(onClick).not.toHaveBeenCalled();
    });

    it('onClickが未指定でもエラーにならない', () => {
      render(<MovieTile movie={createMockMovie()} />);

      expect(() => {
        fireEvent.click(screen.getByRole('button'));
        fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      }).not.toThrow();
    });
  });

  describe('ウォッチリスト統合', () => {
    it('onWatchlistToggleが指定されるとWatchlistAddButtonが表示される', () => {
      render(
        <MovieTile
          movie={createMockMovie()}
          onWatchlistToggle={jest.fn()}
          isInWatchlist={false}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      ).toBeInTheDocument();
    });

    it('onWatchlistToggleが未指定の場合WatchlistAddButtonが表示されない', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(
        screen.queryByRole('button', { name: 'ウォッチリストに追加' }),
      ).not.toBeInTheDocument();
    });

    it('WatchlistAddButtonクリックがMovieTileのonClickを発火しない', () => {
      const onClick = jest.fn();
      const onWatchlistToggle = jest.fn();
      render(
        <MovieTile
          movie={createMockMovie()}
          onClick={onClick}
          onWatchlistToggle={onWatchlistToggle}
          isInWatchlist={false}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      );
      expect(onWatchlistToggle).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('isInWatchlist=trueの場合「ウォッチリストから削除」が表示される', () => {
      render(
        <MovieTile
          movie={createMockMovie()}
          onWatchlistToggle={jest.fn()}
          isInWatchlist={true}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'ウォッチリストから削除' }),
      ).toBeInTheDocument();
    });
  });

  describe('評価バッジ', () => {
    it('評価が5〜7未満の場合midクラスが適用される', () => {
      const { container } = render(
        <MovieTile movie={createMockMovie({ vote_average: 6.0 })} />,
      );
      expect(screen.getByText('6.0')).toBeInTheDocument();
      expect(
        container.querySelector('[class*="rating__mid"]'),
      ).toBeInTheDocument();
    });

    it('評価が5未満の場合lowクラスが適用される', () => {
      const { container } = render(
        <MovieTile movie={createMockMovie({ vote_average: 3.5 })} />,
      );
      expect(screen.getByText('3.5')).toBeInTheDocument();
      expect(
        container.querySelector('[class*="rating__low"]'),
      ).toBeInTheDocument();
    });
  });

  describe('お気に入りデータ', () => {
    it('movie.favoriteがundefinedの場合FavoriteButtonにnullが渡される', () => {
      render(
        <MovieTile
          movie={createMockMovie({ favorite: undefined })}
          onFavoriteToggle={jest.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('movie.favoriteが存在する場合FavoriteButtonに渡される', () => {
      render(
        <MovieTile
          movie={createMockMovie({
            favorite: { id: 'fav-1', rating: 8 },
          })}
          onFavoriteToggle={jest.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'お気に入りを編集' }),
      ).toBeInTheDocument();
    });
  });

  describe('興味なし統合', () => {
    it('onDismissが指定されるとDismissButtonが表示される', () => {
      render(<MovieTile movie={createMockMovie()} onDismiss={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: '興味なし' }),
      ).toBeInTheDocument();
    });

    it('onDismissが未指定の場合DismissButtonが表示されない', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(
        screen.queryByRole('button', { name: '興味なし' }),
      ).not.toBeInTheDocument();
    });

    it('DismissButtonクリックがMovieTileのonClickを発火しない', () => {
      const onClick = jest.fn();
      const onDismiss = jest.fn();
      render(
        <MovieTile
          movie={createMockMovie()}
          onClick={onClick}
          onDismiss={onDismiss}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '興味なし' }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('dismissDisabledでボタンが無効になる', () => {
      render(
        <MovieTile
          movie={createMockMovie()}
          onDismiss={jest.fn()}
          dismissDisabled={true}
        />,
      );
      expect(screen.getByRole('button', { name: '興味なし' })).toBeDisabled();
    });
  });

  describe('お気に入り統合', () => {
    it('onFavoriteToggleが指定されるとFavoriteButtonが表示される', () => {
      render(
        <MovieTile movie={createMockMovie()} onFavoriteToggle={jest.fn()} />,
      );
      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('onFavoriteToggleが未指定の場合FavoriteButtonが表示されない', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(
        screen.queryByRole('button', { name: 'お気に入りに追加' }),
      ).not.toBeInTheDocument();
    });
  });
});
