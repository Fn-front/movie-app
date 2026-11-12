import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NowShowingMovie } from '@/lib/types';
import type { Recommendation } from '@/schema/recommendations';

import { HomeMovieDetailModal } from './homeMovieDetailModal';

// --- Mocks ---

let mockSelectedMovieId: number | null = null;
const mockCloseMovieDetail = jest.fn();

jest.mock('@/features/movies/hooks/useMovieDetailQuery', () => ({
  useMovieDetailQuery: () => ({
    selectedMovieId: mockSelectedMovieId,
    openMovieDetail: jest.fn(),
    closeMovieDetail: mockCloseMovieDetail,
  }),
}));

/**
 * `MovieDetailModal` は `MovieDetailContent` 経由で next-auth まで辿るため、
 * ここでは受け取ったプロパティだけを見る差し替えにする。
 */
jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    title,
    manageHistory,
    onClose,
  }: {
    movieId: number | null;
    title?: string;
    manageHistory?: boolean;
    onClose: () => void;
  }) =>
    movieId === null ? null : (
      <div
        data-testid='movie-detail-modal'
        data-title={title ?? ''}
        data-manage-history={String(manageHistory)}
      >
        <button type='button' onClick={onClose}>
          閉じる
        </button>
      </div>
    ),
}));

// --- Fixtures ---

const nowShowingMovies: NowShowingMovie[] = [
  {
    id: 'now-showing-1',
    tmdb_movie_id: 101,
    title: '公開中の映画',
    poster_path: null,
    release_date: '2026-01-01',
    vote_average: 7.5,
    vote_count: 100,
    popularity: 50,
    display_order: 1,
    fetched_at: '2026-01-01T00:00:00.000Z',
  },
];

const recommendations: Recommendation[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tmdb_movie_id: 202,
    title: 'おすすめの映画',
    poster_path: null,
    release_date: '2026-02-01',
    vote_average: 8,
    vote_count: 200,
    genre_ids: [28],
    reason: 'アクション作品を好んでいるため',
    display_order: 1,
  },
];

const renderModal = () =>
  render(
    <HomeMovieDetailModal
      nowShowingMovies={nowShowingMovies}
      recommendations={recommendations}
    />,
  );

// --- Tests ---

describe('HomeMovieDetailModal', () => {
  beforeEach(() => {
    // URL のクエリ相当。持ち越すと前のテストのモーダルが残る
    mockSelectedMovieId = null;
    jest.clearAllMocks();
  });

  it('URLに movie_id が無いときはモーダルを出さない', () => {
    renderModal();

    expect(screen.queryByTestId('movie-detail-modal')).not.toBeInTheDocument();
  });

  it('公開中の映画のタイトルをダイアログ名に使う', () => {
    mockSelectedMovieId = 101;
    renderModal();

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-title',
      '公開中の映画',
    );
  });

  it('レコメンドの映画のタイトルをダイアログ名に使う', () => {
    mockSelectedMovieId = 202;
    renderModal();

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-title',
      'おすすめの映画',
    );
  });

  // 「他の作品を見る」で差し替わったレコメンドはここに届かないため、
  // タイトルを渡せず MovieDetailModal の既定値にフォールバックする（#1077）
  it('どちらの一覧にも無いIDではタイトルを渡さない', () => {
    mockSelectedMovieId = 999;
    renderModal();

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-title',
      '',
    );
  });

  // 開閉は URL が持つ。ここでも履歴を積むと開くたびに2つ伸びる（#1033）
  it('履歴はルーターに任せる（manageHistory=false）', () => {
    mockSelectedMovieId = 101;
    renderModal();

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-manage-history',
      'false',
    );
  });

  it('閉じるとURLのクエリを戻す', async () => {
    const user = userEvent.setup();
    mockSelectedMovieId = 101;
    renderModal();

    await user.click(screen.getByRole('button', { name: '閉じる' }));

    expect(mockCloseMovieDetail).toHaveBeenCalledTimes(1);
  });
});
