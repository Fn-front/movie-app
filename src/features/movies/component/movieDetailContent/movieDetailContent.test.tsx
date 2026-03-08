/**
 * MovieDetailContentコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { MovieDetailContent } from './movieDetailContent';

// --- Mocks ---

const mockUseMovieDetail = jest.fn();

jest.mock('@/features/movies/hooks/useMovieDetail', () => ({
  useMovieDetail: (...args: unknown[]) => mockUseMovieDetail(...args),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} />;
  },
}));

// --- Tests ---

describe('MovieDetailContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ローディング中はスピナーを表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: undefined,
      isLoading: true,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('エラー時はエラーメッセージを表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: undefined,
      isLoading: false,
      isError: true,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(
      screen.getByText('映画情報の取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('映画詳細を表示する', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト映画',
        original_title: 'Test Movie',
        overview: 'テスト概要です。',
        release_date: '2025-03-15',
        runtime: 125,
        vote_average: 8.5,
        genres: [
          { id: 28, name: 'アクション' },
          { id: 12, name: 'アドベンチャー' },
        ],
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.getByText('テスト映画')).toBeInTheDocument();
    expect(screen.getByText('Test Movie')).toBeInTheDocument();
    expect(screen.getByText('テスト概要です。')).toBeInTheDocument();
    expect(screen.getByText('2025年03月15日')).toBeInTheDocument();
    expect(screen.getByText('2時間5分')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('アクション')).toBeInTheDocument();
    expect(screen.getByText('アドベンチャー')).toBeInTheDocument();
    expect(screen.getByText('あらすじ')).toBeInTheDocument();
  });

  it('原題がタイトルと同じ場合は原題を非表示にする', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: '同じタイトル',
        original_title: '同じタイトル',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 0,
        genres: [],
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    const titles = screen.getAllByText('同じタイトル');
    expect(titles).toHaveLength(1);
  });

  it('概要がない場合はあらすじセクションを非表示にする', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: {
        id: 123,
        title: 'テスト',
        original_title: 'Test',
        overview: '',
        release_date: '2025-01-01',
        runtime: 90,
        vote_average: 7.0,
        genres: [],
        poster_path: null,
        backdrop_path: null,
      },
      isLoading: false,
      isError: false,
    });

    render(<MovieDetailContent movieId={123} />);

    expect(screen.queryByText('あらすじ')).not.toBeInTheDocument();
  });
});
