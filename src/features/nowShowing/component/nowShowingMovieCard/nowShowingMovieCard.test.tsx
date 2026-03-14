import { render, screen, fireEvent } from '@testing-library/react';

import { NowShowingMovieCard } from './nowShowingMovieCard';
import type { TrendingMovie } from '@/lib/types';

// --- Helpers ---

const createMockMovie = (
  overrides?: Partial<TrendingMovie>,
): TrendingMovie => ({
  id: 'uuid-1',
  tmdb_movie_id: 100,
  title: 'テスト映画',
  poster_path: '/poster.jpg',
  release_date: '2026-03-01',
  vote_average: 8.0,
  popularity: 200,
  display_order: 1,
  fetched_at: '2026-03-14T00:00:00Z',
  ...overrides,
});

// --- Tests ---

describe('NowShowingMovieCard', () => {
  describe('表示', () => {
    it('映画タイトルが表示される', () => {
      render(<NowShowingMovieCard movie={createMockMovie()} />);
      expect(screen.getByText('テスト映画')).toBeInTheDocument();
    });

    it('ポスター画像が表示される', () => {
      render(<NowShowingMovieCard movie={createMockMovie()} />);
      const img = screen.getByAltText('テスト映画のポスター');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        'src',
        expect.stringContaining('poster.jpg'),
      );
    });

    it('poster_pathがnullの場合No Imageが表示される', () => {
      render(
        <NowShowingMovieCard
          movie={createMockMovie({ poster_path: null })}
        />,
      );
      expect(screen.getByText('No Image')).toBeInTheDocument();
    });

    it('順位バッジが表示される', () => {
      render(
        <NowShowingMovieCard
          movie={createMockMovie({ display_order: 3 })}
        />,
      );
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('評価が表示される', () => {
      render(
        <NowShowingMovieCard
          movie={createMockMovie({ vote_average: 8.0 })}
        />,
      );
      expect(screen.getByText('8.0')).toBeInTheDocument();
    });

    it('評価が0の場合表示されない', () => {
      const { container } = render(
        <NowShowingMovieCard
          movie={createMockMovie({ vote_average: 0 })}
        />,
      );
      expect(
        container.querySelector('[class*="rating"]'),
      ).not.toBeInTheDocument();
    });

    it('評価がnullの場合表示されない', () => {
      const { container } = render(
        <NowShowingMovieCard
          movie={createMockMovie({ vote_average: null })}
        />,
      );
      expect(
        container.querySelector('[class*="rating"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe('評価バッジ', () => {
    it('評価が7以上の場合highクラスが適用される', () => {
      const { container } = render(
        <NowShowingMovieCard
          movie={createMockMovie({ vote_average: 8.5 })}
        />,
      );
      expect(
        container.querySelector('[class*="rating__high"]'),
      ).toBeInTheDocument();
    });

    it('評価が5〜7未満の場合midクラスが適用される', () => {
      const { container } = render(
        <NowShowingMovieCard
          movie={createMockMovie({ vote_average: 6.0 })}
        />,
      );
      expect(
        container.querySelector('[class*="rating__mid"]'),
      ).toBeInTheDocument();
    });

    it('評価が5未満の場合lowクラスが適用される', () => {
      const { container } = render(
        <NowShowingMovieCard
          movie={createMockMovie({ vote_average: 3.5 })}
        />,
      );
      expect(
        container.querySelector('[class*="rating__low"]'),
      ).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('aria-labelが設定される', () => {
      render(<NowShowingMovieCard movie={createMockMovie()} />);
      expect(
        screen.getByRole('button', {
          name: 'テスト映画の詳細を表示',
        }),
      ).toBeInTheDocument();
    });

    it('tabIndex=0が設定される', () => {
      render(<NowShowingMovieCard movie={createMockMovie()} />);
      expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
    });
  });

  describe('インタラクション', () => {
    it('クリック時にonClickがtmdb_movie_idで呼ばれる', () => {
      const onClick = jest.fn();
      render(
        <NowShowingMovieCard
          movie={createMockMovie({ tmdb_movie_id: 100 })}
          onClick={onClick}
        />,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledWith(100);
    });

    it('Enterキーでクリックが発火する', () => {
      const onClick = jest.fn();
      render(
        <NowShowingMovieCard
          movie={createMockMovie()}
          onClick={onClick}
        />,
      );

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      expect(onClick).toHaveBeenCalledWith(100);
    });

    it('Spaceキーでクリックが発火する', () => {
      const onClick = jest.fn();
      render(
        <NowShowingMovieCard
          movie={createMockMovie()}
          onClick={onClick}
        />,
      );

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(onClick).toHaveBeenCalledWith(100);
    });

    it('他のキーではonClickが呼ばれない', () => {
      const onClick = jest.fn();
      render(
        <NowShowingMovieCard
          movie={createMockMovie()}
          onClick={onClick}
        />,
      );

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
      expect(onClick).not.toHaveBeenCalled();
    });

    it('onClickが未指定でもエラーにならない', () => {
      render(<NowShowingMovieCard movie={createMockMovie()} />);

      expect(() => {
        fireEvent.click(screen.getByRole('button'));
        fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      }).not.toThrow();
    });
  });
});
