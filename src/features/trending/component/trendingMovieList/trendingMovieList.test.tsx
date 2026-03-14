import { render, screen, fireEvent } from '@testing-library/react';

import { TrendingMovieList } from './trendingMovieList';
import type { TrendingMovie } from '@/lib/types';

// --- Mocks ---

const mockUseTrendingMovies = jest.fn();
jest.mock('@/features/trending/hooks/useTrendingMovies', () => ({
  useTrendingMovies: () => mockUseTrendingMovies(),
}));

jest.mock(
  '@/components/ui/movie/detailModal/movieDetailModal',
  () => ({
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
  }),
);

// --- Helpers ---

const createMockTrendingMovies = (count: number): TrendingMovie[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `uuid-${i + 1}`,
    tmdb_movie_id: 100 + i,
    title: `トレンド映画 ${i + 1}`,
    poster_path: `/trending${i + 1}.jpg`,
    release_date: '2026-03-01',
    vote_average: 7.5,
    popularity: 200 - i,
    display_order: i + 1,
    fetched_at: '2026-03-14T00:00:00Z',
  }));

// --- Tests ---

describe('TrendingMovieList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ローディング状態', () => {
    it('ローディング中にセクションタイトルとローディング表示がされる', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: [],
        isLoading: true,
        isError: false,
      });

      render(<TrendingMovieList />);
      expect(screen.getByText('今週のトレンド')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    it('エラー時にエラーメッセージが表示される', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: [],
        isLoading: false,
        isError: true,
      });

      render(<TrendingMovieList />);
      expect(screen.getByText('今週のトレンド')).toBeInTheDocument();
      expect(
        screen.getByText('トレンド映画の取得に失敗しました'),
      ).toBeInTheDocument();
    });
  });

  describe('空状態', () => {
    it('データが空の場合に空メッセージが表示される', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: [],
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);
      expect(screen.getByText('今週のトレンド')).toBeInTheDocument();
      expect(
        screen.getByText('トレンド映画データがありません'),
      ).toBeInTheDocument();
    });
  });

  describe('データ表示', () => {
    it('トレンド映画カードが表示される', () => {
      const movies = createMockTrendingMovies(3);
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: movies,
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);
      expect(screen.getByText('今週のトレンド')).toBeInTheDocument();
      expect(screen.getByText('トレンド映画 1')).toBeInTheDocument();
      expect(screen.getByText('トレンド映画 2')).toBeInTheDocument();
      expect(screen.getByText('トレンド映画 3')).toBeInTheDocument();
    });

    it('リストにrole=listが設定される', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: createMockTrendingMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);
      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('各カードにrole=listitemが設定される', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: createMockTrendingMovies(3),
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });

  describe('モーダル連携', () => {
    it('カードクリックで映画詳細モーダルが表示される', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: createMockTrendingMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);

      fireEvent.click(
        screen.getByRole('button', {
          name: 'トレンド映画 1の詳細を表示',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
      expect(screen.getByText('Movie ID: 100')).toBeInTheDocument();
    });

    it('モーダルの閉じるボタンでモーダルが非表示になる', () => {
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: createMockTrendingMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);

      fireEvent.click(
        screen.getByRole('button', {
          name: 'トレンド映画 1の詳細を表示',
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
      mockUseTrendingMovies.mockReturnValue({
        trendingMovies: createMockTrendingMovies(1),
        isLoading: false,
        isError: false,
      });

      render(<TrendingMovieList />);
      expect(
        screen.getByRole('region', { name: '今週のトレンド' }),
      ).toBeInTheDocument();
    });
  });
});
