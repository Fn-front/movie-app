/**
 * PersonFilmographyコンポーネントのテスト
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  ARIA_LABELS,
  PERSON_FILMOGRAPHY_PAGE_SIZE,
  PERSON_MESSAGES,
} from '@/constants';
import type { PersonMovieCredit } from '@/lib/types';

import { PersonFilmography } from './personFilmography';

// --- Mocks ---

// --- 映画詳細モーダル（URLクエリで開閉する・#1033）---

let mockSelectedMovieId: number | null = null;
const mockOpenMovieDetail = jest.fn();
const mockCloseMovieDetail = jest.fn();

jest.mock('@/features/movies/hooks/useMovieDetailQuery', () => ({
  useMovieDetailQuery: () => ({
    selectedMovieId: mockSelectedMovieId,
    openMovieDetail: mockOpenMovieDetail,
    closeMovieDetail: mockCloseMovieDetail,
  }),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    title,
    showFinancialInfo,
    onClose,
  }: {
    movieId: number | null;
    title?: string;
    showFinancialInfo?: boolean;
    onClose: () => void;
  }) =>
    movieId === null ? null : (
      <div
        data-testid='movie-detail-modal'
        data-financial={String(Boolean(showFinancialInfo))}
      >
        <span>{`Movie ID: ${movieId}`}</span>
        <span>{title}</span>
        <button onClick={onClose}>閉じる</button>
      </div>
    ),
}));

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: jest.fn(({ movie, viewMode }) => (
    <div data-testid={`movie-tile-${movie.id}`} data-view-mode={viewMode}>
      {/* 詳細への遷移はタイル側のリンクが担う（#1033） */}
      <a href={`/movies/${movie.id}`}>{movie.title}</a>
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
  // 表示モードは localStorage に残る。消さないと後続のテストへ漏れる
  beforeEach(() => {
    mockSelectedMovieId = null;
    localStorage.clear();
  });

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

  // 表示切替は共通設定（#1014）。この画面にも導線が要る
  describe('表示モード', () => {
    it('表示切替のトグルを出す', () => {
      render(<PersonFilmography credits={createCredits(3)} />);

      expect(
        screen.getByRole('button', { name: ARIA_LABELS.LIST_VIEW }),
      ).toBeInTheDocument();
    });

    it('リストに切り替えると一覧とタイルの両方がリストになる', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <PersonFilmography credits={createCredits(3)} />,
      );

      await user.click(
        screen.getByRole('button', { name: ARIA_LABELS.LIST_VIEW }),
      );

      expect(
        container.querySelector('.c_movie_grid_container__list'),
      ).toBeInTheDocument();
      // コンテナだけ切り替えてタイルがグリッドのままだと、
      // 縦長カードが1列に並ぶだけで一覧性が上がらない
      expect(screen.getByTestId('movie-tile-1')).toHaveAttribute(
        'data-view-mode',
        'list',
      );
    });

    it('もう一度押すとグリッドへ戻る', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <PersonFilmography credits={createCredits(3)} />,
      );
      const toggle = screen.getByRole('button', {
        name: ARIA_LABELS.LIST_VIEW,
      });

      await user.click(toggle);
      await user.click(toggle);

      expect(
        container.querySelector('.c_movie_grid_container__grid'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('movie-tile-1')).toHaveAttribute(
        'data-view-mode',
        'grid',
      );
    });
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

  // 映画詳細は /movies/[id] というURLを持つルートになった（#1033）
  it('出演作のタイルが映画詳細へのリンクを持つ', () => {
    render(<PersonFilmography credits={createCredits(2)} />);

    expect(
      within(screen.getByTestId('movie-tile-2')).getByRole('link', {
        name: '出演作2',
      }),
    ).toHaveAttribute('href', '/movies/2');
  });
});
