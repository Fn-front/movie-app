import { render, screen, fireEvent } from '@testing-library/react';

import { RecommendationSection } from './recommendationSection';

// --- Mocks ---

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
    onFavoriteToggle,
  }: {
    movie: { id: number; title: string };
    onClick?: (movieId: number) => void;
    onFavoriteToggle?: () => void;
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
      {onFavoriteToggle && (
        <button
          data-testid={`favorite-btn-${movie.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle();
          }}
        >
          お気に入り
        </button>
      )}
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

const mockHandleFavoriteToggle = jest.fn();
const mockCloseFavoriteModal = jest.fn();
const mockHandleFavoriteModalSubmit = jest.fn();
const mockHandleFavoriteDelete = jest.fn();
const mockIsFavoriteProcessing = jest.fn().mockReturnValue(false);

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: mockHandleFavoriteToggle,
    closeModal: mockCloseFavoriteModal,
    handleModalSubmit: mockHandleFavoriteModalSubmit,
    handleDelete: mockHandleFavoriteDelete,
    isFavoriteProcessing: mockIsFavoriteProcessing,
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => <div data-testid='favorite-rating-modal' />,
  }),
);

// --- Helpers ---

const createMockRecommendations = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `rec-${i + 1}`,
    tmdb_movie_id: 100 + i,
    title: `おすすめ映画 ${i + 1}`,
    poster_path: `/poster${i + 1}.jpg`,
    release_date: '2026-01-01',
    vote_average: 7.5,
    genre_ids: [878],
    reason: `理由 ${i + 1}`,
    display_order: i + 1,
  }));

// --- Tests ---

describe('RecommendationSection', () => {
  describe('お気に入り0件', () => {
    it('登録促進テキストが表示される', () => {
      render(
        <RecommendationSection recommendations={[]} hasFavorites={false} />,
      );

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(
        screen.getByText(
          'お気に入りを登録すると、AIがおすすめ映画を提案します',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('レコメンド未生成', () => {
    it('準備中テキストが表示される', () => {
      render(
        <RecommendationSection recommendations={[]} hasFavorites={true} />,
      );

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画を準備中です')).toBeInTheDocument();
    });
  });

  describe('レコメンドあり', () => {
    it('MovieTileが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(3)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('あなたへのおすすめ')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 1')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 2')).toBeInTheDocument();
      expect(screen.getByText('おすすめ映画 3')).toBeInTheDocument();
    });

    it('推薦理由が表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByText('理由 1')).toBeInTheDocument();
      expect(screen.getByText('理由 2')).toBeInTheDocument();
    });

    it('グリッドにrole=listが設定される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('各アイテムにrole=listitemが設定される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(3)}
          hasFavorites={true}
        />,
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });
  });

  describe('モーダル連携', () => {
    it('タイルクリックでMovieDetailModalが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: 'おすすめ映画 1の詳細を表示',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
      expect(screen.getByText('Movie ID: 100')).toBeInTheDocument();
    });

    it('モーダルの閉じるボタンでモーダルが非表示になる', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', {
          name: 'おすすめ映画 1の詳細を表示',
        }),
      );
      expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByText('閉じる'));
      expect(
        screen.queryByTestId('movie-detail-modal'),
      ).not.toBeInTheDocument();
    });
  });

  describe('お気に入りボタン', () => {
    it('各MovieTileにお気に入りボタンが表示される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(2)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('favorite-btn-100')).toBeInTheDocument();
      expect(screen.getByTestId('favorite-btn-101')).toBeInTheDocument();
    });

    it('FavoriteRatingModalがレンダリングされる', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(screen.getByTestId('favorite-rating-modal')).toBeInTheDocument();
    });
  });

  describe('アクセシビリティ', () => {
    it('sectionにaria-labelが設定される', () => {
      render(
        <RecommendationSection
          recommendations={createMockRecommendations(1)}
          hasFavorites={true}
        />,
      );

      expect(
        screen.getByRole('region', { name: 'あなたへのおすすめ' }),
      ).toBeInTheDocument();
    });
  });
});
