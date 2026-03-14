import { render, screen, fireEvent } from '@testing-library/react';

import { NowShowingMovieList } from './nowShowingMovieList';
import type { NowShowingMovie } from '@/lib/types';

// --- Mocks ---

const mockUseNowShowingMovies = jest.fn();
jest.mock('@/features/nowShowing/hooks/useNowShowingMovies', () => ({
  useNowShowingMovies: () => mockUseNowShowingMovies(),
}));

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
  }: {
    movie: { id: number; title: string };
    onClick?: (movieId: number) => void;
  }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      role='button'
      tabIndex={0}
      aria-label={`${movie.title}の詳細を表示`}
      onClick={() => onClick?.(movie.id)}
      onKeyDown={() => {}}
    >
      {movie.title}
    </div>
  ),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    onClose,
  }: {
    movieId: number | null;
    onClose: () => void;
  }) =>
    movieId ? (
      <div data-testid='movie-detail-modal'>
        <span>Movie ID: {movieId}</span>
        <button onClick={onClose}>閉じる</button>
      </div>
    ) : null,
}));

// --- Helpers ---

const createMockMovies = (count: number): NowShowingMovie[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `uuid-${i + 1}`,
    tmdb_movie_id: 100 + i,
    title: `人気映画 ${i + 1}`,
    poster_path: `/poster${i + 1}.jpg`,
    release_date: '2026-03-01',
    vote_average: 7.5,
    popularity: 200 - i,
    display_order: i + 1,
    fetched_at: '2026-03-14T00:00:00Z',
  }));

// --- Tests ---

describe('NowShowingMovieList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ローディング状態', () => {
    it('ローディング中にセクションタイトルとローディング表示がされる', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: [],
        isLoading: true,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(screen.getByText('劇場公開中の人気作品')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時にエラーメッセージが表示される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: [],
        isLoading: false,
        isError: true,
      });

      render(<NowShowingMovieList />);
      expect(screen.getByText('劇場公開中の人気作品')).toBeInTheDocument();
      expect(
        screen.getByText('劇場公開中の人気映画の取得に失敗しました'),
      ).toBeInTheDocument();
    });
  });

  describe('空状態', () => {
    it('データが空の場合に空メッセージが表示される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: [],
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(screen.getByText('劇場公開中の人気作品')).toBeInTheDocument();
      expect(
        screen.getByText('劇場公開中の人気映画データがありません'),
      ).toBeInTheDocument();
    });
  });

  describe('データ表示', () => {
    it('映画カードが表示される', () => {
      const movies = createMockMovies(3);
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: movies,
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(screen.getByText('劇場公開中の人気作品')).toBeInTheDocument();
      expect(screen.getByText('人気映画 1')).toBeInTheDocument();
      expect(screen.getByText('人気映画 2')).toBeInTheDocument();
      expect(screen.getByText('人気映画 3')).toBeInTheDocument();
    });

    it('リストにrole=listが設定される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('各カードにrole=listitemが設定される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(3),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('ランクバッジが表示される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(3),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('NowShowingMovieがMovieCacheItemに変換されてMovieTileに渡される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      // tmdb_movie_id (100) がMovieTileのmovie.idとして使われる
      expect(screen.getByTestId('movie-tile-100')).toBeInTheDocument();
    });
  });

  describe('モーダル連携', () => {
    it('カードクリックで映画詳細モーダルが表示される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);

      fireEvent.click(
        screen.getByRole('button', {
          name: '人気映画 1の詳細を表示',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
      expect(screen.getByText('Movie ID: 100')).toBeInTheDocument();
    });

    it('モーダルの閉じるボタンでモーダルが非表示になる', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);

      fireEvent.click(
        screen.getByRole('button', {
          name: '人気映画 1の詳細を表示',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByText('閉じる'));
      expect(
        screen.queryByTestId('movie-detail-modal'),
      ).not.toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('sectionにaria-labelが設定される', () => {
      mockUseNowShowingMovies.mockReturnValue({
        nowShowingMovies: createMockMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<NowShowingMovieList />);
      expect(
        screen.getByRole('region', { name: '劇場公開中の人気作品' }),
      ).toBeInTheDocument();
    });
  });
});
