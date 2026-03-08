import { render, screen, fireEvent } from '@testing-library/react';

import { MovieListContent } from './movieListContent';
import type { UseMovieListReturn } from '@/features/movies/hooks/useMovieList';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

// --- Mocks ---

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ current: null }),
}));

jest.mock(
  '@/features/movies/component/movieDetailModal/movieDetailModal',
  () => ({
    MovieDetailModal: () => null,
  }),
);

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
  genre_ids: [28],
  release_type: 'theatrical',
  is_revival: false,
  ...overrides,
});

const createMockMovieList = (
  overrides?: Partial<UseMovieListReturn>,
): UseMovieListReturn => ({
  movies: [],
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  sortBy: 'release_date',
  releaseType: 'theatrical',
  genres: { 28: 'アクション' },
  selectedGenreIds: [],
  dateRange: {},
  isRevivalFilter: undefined,
  isFilterModalOpen: false,
  handleSortChange: jest.fn(),
  handleReleaseTypeChange: jest.fn(),
  handleFilterApply: jest.fn(),
  handleFilterModalOpen: jest.fn(),
  handleFilterModalClose: jest.fn(),
  ...overrides,
});

// --- Tests ---

describe('MovieListContent', () => {
  describe('表示', () => {
    it('タイトルが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(screen.getByText('公開予定')).toBeInTheDocument();
    });

    it('リリースタイプのタブが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(screen.getByRole('tab', { name: '劇場公開' })).toBeInTheDocument();
      expect(
        screen.getByRole('tab', { name: 'ストリーミング' }),
      ).toBeInTheDocument();
    });

    it('フィルターボタンが表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        screen.getByRole('button', { name: 'フィルター' }),
      ).toBeInTheDocument();
    });

    it('ソート選択が表示される', () => {
      render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        screen.getByRole('combobox', { name: 'ソート順を選択' }),
      ).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('isLoading=trueの場合スケルトンが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ isLoading: true })}
        />,
      );
      const skeletons = container.querySelectorAll('.c_movie_tile_skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('isLoading=trueの場合映画タイルが表示されない', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            isLoading: true,
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(screen.queryByText('テスト映画')).not.toBeInTheDocument();
    });

    it('isFetchingNextPage=trueの場合ローディングが表示される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            isFetchingNextPage: true,
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('映画一覧', () => {
    it('映画が表示される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [
              createMockMovie({ id: 1, title: '映画A' }),
              createMockMovie({ id: 2, title: '映画B' }),
            ],
          })}
        />,
      );
      expect(screen.getByText('映画A')).toBeInTheDocument();
      expect(screen.getByText('映画B')).toBeInTheDocument();
    });

    it('映画が空でローディングでない場合空メッセージが表示される', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ movies: [], isLoading: false })}
        />,
      );
      expect(
        screen.getByText('表示する映画がありません。'),
      ).toBeInTheDocument();
    });

    it('映画がある場合空メッセージが表示されない', () => {
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            movies: [createMockMovie()],
          })}
        />,
      );
      expect(
        screen.queryByText('表示する映画がありません。'),
      ).not.toBeInTheDocument();
    });
  });

  describe('フィルターバッジ', () => {
    it('ジャンルが選択されている場合バッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ selectedGenreIds: [28] })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('日付範囲gteがある場合バッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({
            dateRange: { gte: '2026-03-01' },
          })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('isRevivalFilterが設定されている場合バッジが表示される', () => {
      const { container } = render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ isRevivalFilter: false })}
        />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).toBeInTheDocument();
    });

    it('フィルターが無効な場合バッジが表示されない', () => {
      const { container } = render(
        <MovieListContent title='公開予定' movieList={createMockMovieList()} />,
      );
      expect(
        container.querySelector('.c_movie_list__filter_count'),
      ).not.toBeInTheDocument();
    });
  });

  describe('インタラクション', () => {
    it('タブクリックでhandleReleaseTypeChangeが呼ばれる', () => {
      const handleReleaseTypeChange = jest.fn();
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ handleReleaseTypeChange })}
        />,
      );

      // Radix TabsはmouseDownで値を変更する
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'ストリーミング' }));
      expect(handleReleaseTypeChange).toHaveBeenCalledWith('streaming');
    });

    it('フィルターボタンクリックでhandleFilterModalOpenが呼ばれる', () => {
      const handleFilterModalOpen = jest.fn();
      render(
        <MovieListContent
          title='公開予定'
          movieList={createMockMovieList({ handleFilterModalOpen })}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'フィルター' }));
      expect(handleFilterModalOpen).toHaveBeenCalled();
    });
  });
});
