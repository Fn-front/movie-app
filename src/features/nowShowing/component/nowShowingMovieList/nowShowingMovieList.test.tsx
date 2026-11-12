import { render, screen } from '@testing-library/react';

import { NowShowingMovieList } from './nowShowingMovieList';
import type { NowShowingMovie } from '@/lib/types';

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

// MovieTile は本物を使う。「タイルが映画詳細のURLへのリンクになっているか」が
// この画面の主要な導線で、差し替えると配線を確認できないため（#1033）

// --- Helpers ---

const createMockMovies = (count: number): NowShowingMovie[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `uuid-${i + 1}`,
    tmdb_movie_id: 100 + i,
    title: `人気映画 ${i + 1}`,
    poster_path: `/poster${i + 1}.jpg`,
    release_date: '2026-03-01',
    vote_average: 7.5,
    vote_count: 1200,
    popularity: 200 - i,
    display_order: i + 1,
    fetched_at: '2026-03-14T00:00:00Z',
  }));

// --- Tests ---

describe('NowShowingMovieList', () => {
  beforeEach(() => {
    mockSelectedMovieId = null;
    jest.clearAllMocks();
  });

  describe('空状態', () => {
    it('データが空の場合に空メッセージが表示される', () => {
      render(<NowShowingMovieList movies={[]} />);
      expect(screen.getByText('劇場公開中の人気作品')).toBeInTheDocument();
      expect(
        screen.getByText('劇場公開中の人気映画データがありません'),
      ).toBeInTheDocument();
    });
  });

  describe('データ表示', () => {
    it('映画カードが表示される', () => {
      const movies = createMockMovies(3);

      render(<NowShowingMovieList movies={movies} />);
      expect(screen.getByText('劇場公開中の人気作品')).toBeInTheDocument();
      expect(screen.getByText('人気映画 1')).toBeInTheDocument();
      expect(screen.getByText('人気映画 2')).toBeInTheDocument();
      expect(screen.getByText('人気映画 3')).toBeInTheDocument();
    });

    it('リストにrole=listが設定される', () => {
      render(<NowShowingMovieList movies={createMockMovies(1)} />);
      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('各カードにrole=listitemが設定される', () => {
      render(<NowShowingMovieList movies={createMockMovies(3)} />);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('ランクバッジが表示される', () => {
      render(<NowShowingMovieList movies={createMockMovies(3)} />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('NowShowingMovieがMovieCacheItemに変換されてMovieTileに渡される', () => {
      render(<NowShowingMovieList movies={createMockMovies(1)} />);
      // tmdb_movie_id (100) がMovieTileのmovie.idとして使われる
      expect(screen.getByAltText('人気映画 1のポスター')).toBeInTheDocument();
    });
  });

  // 映画詳細はモーダルではなく /movies/[id] というURLを持つ（#1033）
  describe('詳細への導線', () => {
    it('各タイルのタイトルが映画詳細へのリンクになる', () => {
      render(<NowShowingMovieList movies={createMockMovies(2)} />);

      expect(screen.getByRole('link', { name: '人気映画 1' })).toHaveAttribute(
        'href',
        '/movies/100',
      );
      expect(screen.getByRole('link', { name: '人気映画 2' })).toHaveAttribute(
        'href',
        '/movies/101',
      );
    });
  });

  describe('アクセシビリティ', () => {
    it('sectionにaria-labelが設定される', () => {
      render(<NowShowingMovieList movies={createMockMovies(1)} />);
      expect(
        screen.getByRole('region', { name: '劇場公開中の人気作品' }),
      ).toBeInTheDocument();
    });
  });
});
