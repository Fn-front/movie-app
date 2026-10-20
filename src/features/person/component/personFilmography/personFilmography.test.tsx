/**
 * PersonFilmographyコンポーネントのテスト
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PERSON_FILMOGRAPHY_PAGE_SIZE, PERSON_MESSAGES } from '@/constants';
import type { PersonMovieCredit } from '@/lib/types';

import { PersonFilmography } from './personFilmography';

// --- Mocks ---

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: jest.fn(({ movie, onClick }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      onClick={() => onClick?.(movie.id)}
    >
      {movie.title}
    </div>
  )),
}));

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: jest.fn(() => <div data-testid='movie-tile-skeleton' />),
}));

jest.mock('@/components/ui/pagination/pagination', () => ({
  Pagination: jest.fn(({ currentPage, totalPages, onPageChange }) => (
    <nav data-testid='pagination'>
      <span>
        ページ {currentPage} / {totalPages}
      </span>
      <button onClick={() => onPageChange(currentPage + 1)}>次のページ</button>
    </nav>
  )),
}));

jest.mock('@/components/ui/emptyState/emptyState', () => ({
  EmptyState: jest.fn(({ title, description }) => (
    <div data-testid='empty-state'>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: jest.fn(({ movieId, title }) =>
    movieId === null ? null : (
      <div data-testid='movie-detail-modal'>
        <span>{`Movie ID: ${movieId}`}</span>
        <span>{title}</span>
      </div>
    ),
  ),
}));

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: jest.fn(() => false),
    toggleWatchlist: jest.fn(),
    isMovieToggling: jest.fn(() => false),
  }),
}));

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isFavoriteProcessing: jest.fn(() => false),
    getFavoriteInfo: jest.fn(() => null),
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: jest.fn(() => null),
  }),
);

// --- Helpers ---

const createCredit = (
  overrides: Partial<PersonMovieCredit> = {},
): PersonMovieCredit => ({
  id: 1,
  title: '出演作1',
  overview: '概要',
  poster_path: '/p.jpg',
  backdrop_path: null,
  release_date: '2020-01-01',
  vote_average: 7,
  vote_count: 100,
  popularity: 10,
  genre_ids: [28],
  adult: false,
  original_language: 'en',
  character: '主人公',
  ...overrides,
});

const createCredits = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    createCredit({ id: index + 1, title: `出演作${index + 1}` }),
  );

// --- Tests ---

describe('PersonFilmography', () => {
  it('出演作が0件のときは空状態を表示する', () => {
    render(<PersonFilmography credits={[]} />);

    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(
      screen.getByText(PERSON_MESSAGES.FILMOGRAPHY_EMPTY_TITLE),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('出演作をタイルで表示し、件数を見出しに出す', () => {
    render(<PersonFilmography credits={createCredits(3)} />);

    expect(screen.getByTestId('movie-tile-1')).toBeInTheDocument();
    expect(screen.getByTestId('movie-tile-3')).toBeInTheDocument();
    expect(screen.getByText('3件')).toBeInTheDocument();
  });

  it('役名を副表示する', () => {
    render(
      <PersonFilmography credits={[createCredit({ character: '刑事A' })]} />,
    );

    expect(screen.getByText('刑事A')).toBeInTheDocument();
  });

  it('役名が無い出演作では役名を表示しない', () => {
    render(<PersonFilmography credits={[createCredit({ character: '' })]} />);

    expect(screen.getByTestId('movie-tile-1')).toBeInTheDocument();
    expect(screen.queryByText('主人公')).not.toBeInTheDocument();
  });

  describe('ページング', () => {
    it('1ページあたりの表示件数を超える分は次ページに送る', () => {
      render(
        <PersonFilmography
          credits={createCredits(PERSON_FILMOGRAPHY_PAGE_SIZE + 1)}
        />,
      );

      expect(screen.getByTestId('movie-tile-1')).toBeInTheDocument();
      expect(
        screen.queryByTestId(`movie-tile-${PERSON_FILMOGRAPHY_PAGE_SIZE + 1}`),
      ).not.toBeInTheDocument();
      expect(screen.getByText('ページ 1 / 2')).toBeInTheDocument();
    });

    it('次ページに切り替えると続きの出演作を表示する', async () => {
      const user = userEvent.setup();
      render(
        <PersonFilmography
          credits={createCredits(PERSON_FILMOGRAPHY_PAGE_SIZE + 1)}
        />,
      );

      await user.click(screen.getByRole('button', { name: '次のページ' }));

      expect(
        screen.getByTestId(`movie-tile-${PERSON_FILMOGRAPHY_PAGE_SIZE + 1}`),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('movie-tile-1')).not.toBeInTheDocument();
    });

    it('1ページに収まる場合も総ページ数は1になる', () => {
      render(<PersonFilmography credits={createCredits(2)} />);

      expect(screen.getByText('ページ 1 / 1')).toBeInTheDocument();
    });
  });

  it('出演作クリックで映画詳細モーダルが開く', async () => {
    const user = userEvent.setup();
    render(<PersonFilmography credits={createCredits(2)} />);

    expect(screen.queryByTestId('movie-detail-modal')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('movie-tile-2'));

    const modal = within(screen.getByTestId('movie-detail-modal'));
    expect(modal.getByText('Movie ID: 2')).toBeInTheDocument();
    // モーダルのタイトルに選択した作品名が渡る
    expect(modal.getByText('出演作2')).toBeInTheDocument();
  });
});
