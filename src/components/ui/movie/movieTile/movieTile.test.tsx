import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
  vote_count: 1200,
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

  describe('デジタル公開日の優先表示', () => {
    it('既定ではデジタル公開日があってもrelease_dateを表示する', () => {
      render(
        <MovieTile
          movie={createMockMovie({
            release_date: '2026-03-01',
            digital_release_date: '2026-05-20',
          })}
        />,
      );
      expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
      expect(screen.queryByText('2026年05月20日')).not.toBeInTheDocument();
    });

    it('preferDigitalReleaseDateが有効ならデジタル公開日を表示する', () => {
      render(
        <MovieTile
          movie={createMockMovie({
            release_date: '2026-03-01',
            digital_release_date: '2026-05-20',
          })}
          preferDigitalReleaseDate
        />,
      );
      expect(screen.getByText('2026年05月20日')).toBeInTheDocument();
      expect(screen.queryByText('2026年03月01日')).not.toBeInTheDocument();
    });

    it('デジタル公開日がnullならrelease_dateにフォールバックする', () => {
      render(
        <MovieTile
          movie={createMockMovie({
            release_date: '2026-03-01',
            digital_release_date: null,
          })}
          preferDigitalReleaseDate
        />,
      );
      expect(screen.getByText('2026年03月01日')).toBeInTheDocument();
    });

    it('デジタル公開日もrelease_dateもnullなら日付を表示しない', () => {
      render(
        <MovieTile
          movie={createMockMovie({
            release_date: null,
            digital_release_date: null,
          })}
          preferDigitalReleaseDate
        />,
      );
      expect(screen.queryByText(/\d{4}年/)).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('タイトルがbuttonのアクセシブルネームになる', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(
        screen.getByRole('button', { name: 'テスト映画' }),
      ).toBeInTheDocument();
    });

    it('タイトルが見出しとして露出する', () => {
      render(<MovieTile movie={createMockMovie()} />);
      expect(
        screen.getByRole('heading', { level: 3, name: 'テスト映画' }),
      ).toBeInTheDocument();
    });

    it('操作ボタンが詳細ボタンの子孫にならない（nested-interactive対策）', () => {
      render(
        <MovieTile
          movie={createMockMovie()}
          onClick={jest.fn()}
          onWatchlistToggle={jest.fn()}
          onFavoriteToggle={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );

      const detailButton = screen.getByRole('button', { name: 'テスト映画' });
      for (const name of [
        'ウォッチリストに追加',
        'お気に入りに追加',
        '興味なし',
      ]) {
        expect(detailButton).not.toContainElement(
          screen.getByRole('button', { name }),
        );
      }
    });
  });

  describe('インタラクション', () => {
    it('クリック時にonClickが呼ばれる', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      await user.click(screen.getByRole('button', { name: 'テスト映画' }));
      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('Enterキーでクリックが発火する', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      screen.getByRole('button', { name: 'テスト映画' }).focus();
      await user.keyboard('{Enter}');
      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('Spaceキーでクリックが発火する', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      screen.getByRole('button', { name: 'テスト映画' }).focus();
      await user.keyboard('{ }');
      expect(onClick).toHaveBeenCalledWith(1);
    });

    it('他のキーではonClickが呼ばれない', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();
      render(<MovieTile movie={createMockMovie()} onClick={onClick} />);

      screen.getByRole('button', { name: 'テスト映画' }).focus();
      await user.keyboard('{Escape}');
      expect(onClick).not.toHaveBeenCalled();
    });

    it('Tabキーで詳細ボタンに到達できる', async () => {
      const user = userEvent.setup();
      render(<MovieTile movie={createMockMovie()} onClick={jest.fn()} />);

      await user.tab();
      expect(screen.getByRole('button', { name: 'テスト映画' })).toHaveFocus();
    });

    it('onClickが未指定でもエラーにならない', async () => {
      const user = userEvent.setup();
      render(<MovieTile movie={createMockMovie()} />);

      await expect(
        user.click(screen.getByRole('button', { name: 'テスト映画' })),
      ).resolves.not.toThrow();
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

  describe('未公開作品のお気に入り', () => {
    // お気に入りは1〜10の評価とセットなので、まだ観られない作品では出さない
    afterEach(() => {
      jest.useRealTimers();
    });

    const freezeToday = () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 9, 21)); // 2026-10-21
    };

    it('公開日が未来ならお気に入りボタンを表示しない', () => {
      freezeToday();

      render(
        <MovieTile
          movie={createMockMovie({ release_date: '2026-10-22' })}
          onFavoriteToggle={jest.fn()}
        />,
      );

      expect(
        screen.queryByRole('button', { name: 'お気に入りに追加' }),
      ).not.toBeInTheDocument();
    });

    it('公開日が当日ならお気に入りボタンを表示する', () => {
      freezeToday();

      render(
        <MovieTile
          movie={createMockMovie({ release_date: '2026-10-21' })}
          onFavoriteToggle={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('公開日が過去ならお気に入りボタンを表示する', () => {
      freezeToday();

      render(
        <MovieTile
          movie={createMockMovie({ release_date: '2026-10-20' })}
          onFavoriteToggle={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('公開日が不明ならお気に入りボタンを表示する', () => {
      freezeToday();

      render(
        <MovieTile
          movie={createMockMovie({ release_date: null })}
          onFavoriteToggle={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('リバイバル上映は再上映日が未来でもお気に入りボタンを表示する', () => {
      freezeToday();

      // リバイバルのカードが持つ release_date は「日本での再上映日」で、
      // 作品自体は過去に公開済み（詳細モーダルは元の公開日を表示する）
      render(
        <MovieTile
          movie={createMockMovie({
            release_date: '2026-10-23',
            is_revival: true,
          })}
          onFavoriteToggle={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('未公開でもウォッチリスト追加ボタンは表示する', () => {
      freezeToday();

      render(
        <MovieTile
          movie={createMockMovie({ release_date: '2026-10-22' })}
          onFavoriteToggle={jest.fn()}
          onWatchlistToggle={jest.fn()}
        />,
      );

      // 公開前に「これから観る」と登録するのが本来の用途
      expect(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      ).toBeInTheDocument();
    });

    it('未公開でも興味なしボタンは表示する', () => {
      freezeToday();

      render(
        <MovieTile
          movie={createMockMovie({ release_date: '2026-10-22' })}
          onFavoriteToggle={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: /興味なし/ }),
      ).toBeInTheDocument();
    });
  });
});
