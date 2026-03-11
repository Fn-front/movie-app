/**
 * FavoriteListコンポーネント テスト
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FavoriteList } from './favoriteList';
import type { FavoriteItem } from '@/lib/api/favorites/favorites';

// next/imageモック
jest.mock('next/image', () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt='' {...props} />;
  };
  MockImage.displayName = 'MockImage';
  return { __esModule: true, default: MockImage };
});

// getTMDbPosterUrlモック
jest.mock('@/utils/image', () => ({
  getTMDbPosterUrl: (path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w500${path}` : null,
}));

const mockFavorites: FavoriteItem[] = [
  {
    id: 'fav-1',
    tmdb_movie_id: 100,
    title: '映画A',
    poster_path: '/a.jpg',
    release_date: '2026-01-01',
    rating: 8,
    added_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 'fav-2',
    tmdb_movie_id: 200,
    title: '映画B',
    poster_path: null,
    release_date: null,
    rating: 5,
    added_at: '2026-02-15T00:00:00Z',
  },
  {
    id: 'fav-3',
    tmdb_movie_id: 300,
    title: '映画C',
    poster_path: '/c.jpg',
    release_date: '2026-03-01',
    rating: 10,
    added_at: '2026-03-01T00:00:00Z',
  },
];

describe('FavoriteList', () => {
  const mockOnFavoriteToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('複数件をグリッド表示する', () => {
    render(
      <FavoriteList
        favorites={mockFavorites}
        isLoading={false}
        onFavoriteToggle={mockOnFavoriteToggle}
      />,
    );

    expect(screen.getByText('映画A')).toBeInTheDocument();
    expect(screen.getByText('映画B')).toBeInTheDocument();
    expect(screen.getByText('映画C')).toBeInTheDocument();
  });

  it('空状態メッセージが表示される', () => {
    render(
      <FavoriteList
        favorites={[]}
        isLoading={false}
        onFavoriteToggle={mockOnFavoriteToggle}
      />,
    );

    expect(
      screen.getByText('お気に入りの映画を追加しましょう'),
    ).toBeInTheDocument();
  });

  it('ローディング状態が表示される', () => {
    render(
      <FavoriteList
        favorites={[]}
        isLoading={true}
        onFavoriteToggle={mockOnFavoriteToggle}
      />,
    );

    expect(
      screen.queryByText('お気に入りの映画を追加しましょう'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('映画A')).not.toBeInTheDocument();
  });

  it('各タイルにRatingIndicatorが表示される', () => {
    render(
      <FavoriteList
        favorites={mockFavorites}
        isLoading={false}
        onFavoriteToggle={mockOnFavoriteToggle}
      />,
    );

    // RatingIndicatorが表示モードで表示される（role="img"）
    const ratingIndicators = screen.getAllByRole('img', { name: /評価:/ });
    expect(ratingIndicators).toHaveLength(3);
    expect(ratingIndicators[0]).toHaveAttribute('aria-label', '評価: 8/10');
  });

  it('FavoriteButtonクリックでonFavoriteToggleが呼ばれる', async () => {
    const user = userEvent.setup();

    render(
      <FavoriteList
        favorites={mockFavorites}
        isLoading={false}
        onFavoriteToggle={mockOnFavoriteToggle}
      />,
    );

    const favoriteButtons = screen.getAllByRole('button', {
      name: 'お気に入りを編集',
    });
    await user.click(favoriteButtons[0]);

    expect(mockOnFavoriteToggle).toHaveBeenCalledWith(
      {
        id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
      },
      { id: 'fav-1', rating: 8 },
    );
  });

  it('ポスター画像がない場合No Imageが表示される', () => {
    render(
      <FavoriteList
        favorites={[mockFavorites[1]]}
        isLoading={false}
        onFavoriteToggle={mockOnFavoriteToggle}
      />,
    );

    expect(screen.getByText('No Image')).toBeInTheDocument();
  });
});
