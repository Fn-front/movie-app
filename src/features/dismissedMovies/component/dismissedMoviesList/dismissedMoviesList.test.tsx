/**
 * DismissedMoviesListコンポーネント テスト
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DismissedMoviesList } from './dismissedMoviesList';
import type { DismissedMovieItem } from '@/lib/api/dismissedMovies/dismissedMovies';

// next/imageモック
jest.mock('next/image', () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt='' {...props} />;
  };
  MockImage.displayName = 'MockImage';
  return { __esModule: true, default: MockImage };
});

// getTMDbImageUrlモック
jest.mock('@/utils/image', () => ({
  getTMDbImageUrl: (path: string | null, _size?: string) =>
    path ? `https://image.tmdb.org/t/p/w92${path}` : null,
}));

// TanStack Queryモック
const mockMutate = jest.fn();
let mockQueryData: DismissedMovieItem[] = [];
let mockIsLoading = false;

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mockQueryData,
    isLoading: mockIsLoading,
  }),
  useMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock('@/lib/api/dismissedMovies/dismissedMovies', () => ({
  getDismissedMovies: jest.fn(),
  removeDismissedMovie: jest.fn(),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const mockMovies: DismissedMovieItem[] = [
  {
    id: 'dm-1',
    tmdb_movie_id: 101,
    title: 'テスト映画A',
    poster_path: '/a.jpg',
    genre_ids: [28, 12],
    created_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 'dm-2',
    tmdb_movie_id: 202,
    title: 'テスト映画B',
    poster_path: null,
    genre_ids: null,
    created_at: '2026-02-15T00:00:00Z',
  },
];

describe('DismissedMoviesList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryData = [];
    mockIsLoading = false;
  });

  it('ローディング中にLoadingが表示される', () => {
    mockIsLoading = true;

    const { container } = render(<DismissedMoviesList />);

    // Loading コンポーネントが描画される（ローディング用のdivが存在する）
    expect(
      container.querySelector('[class*="dismissed_movies_list__loading"]'),
    ).toBeInTheDocument();
    // 映画タイトルは表示されない
    expect(screen.queryByText('テスト映画A')).not.toBeInTheDocument();
  });

  it('映画がない場合に空状態メッセージが表示される', () => {
    mockQueryData = [];

    render(<DismissedMoviesList />);

    expect(
      screen.getByText('興味なしに登録した映画はありません'),
    ).toBeInTheDocument();
  });

  it('映画一覧が正しく表示される（タイトル・ポスター）', () => {
    mockQueryData = mockMovies;

    render(<DismissedMoviesList />);

    // タイトルが表示される
    expect(screen.getByText('テスト映画A')).toBeInTheDocument();
    expect(screen.getByText('テスト映画B')).toBeInTheDocument();

    // ポスター画像が表示される
    const img = screen.getByAltText('テスト映画A');
    expect(img).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w92/a.jpg');
  });

  it('解除ボタンクリックでremoveDismissedMovieが呼ばれる', async () => {
    const user = userEvent.setup();
    mockQueryData = mockMovies;

    render(<DismissedMoviesList />);

    const removeButtons = screen.getAllByRole('button', {
      name: /の興味なしを解除/,
    });
    await user.click(removeButtons[0]);

    expect(mockMutate).toHaveBeenCalledWith(101);
  });

  it('ポスターがない場合に絵文字が表示される', () => {
    mockQueryData = [mockMovies[1]];

    render(<DismissedMoviesList />);

    // poster_pathがnullの映画Bでは絵文字が表示される
    expect(screen.getByText('テスト映画B')).toBeInTheDocument();
    expect(screen.queryByAltText('テスト映画B')).not.toBeInTheDocument();
  });
});
