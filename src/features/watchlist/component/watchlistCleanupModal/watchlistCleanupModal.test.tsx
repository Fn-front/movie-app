/**
 * WatchlistCleanupModalコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistCleanupModal } from './watchlistCleanupModal';

// --- Mocks ---

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const mockCleanup = {
  years: [
    { year: 2025, count: 3 },
    { year: 2024, count: 12 },
  ],
  isYearsLoading: false,
  selectedYear: 2025,
  handleYearChange: jest.fn(),
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      tmdb_movie_id: 1,
      title: '映画A',
      poster_path: null,
      release_date: '2024-03-15',
      added_at: '2025-03-01T00:00:00Z',
      watched_at: '2025-04-01T00:00:00Z',
    },
  ],
  isItemsLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  selectedCount: 3,
  totalCount: 3,
  isSelected: jest.fn().mockReturnValue(true),
  toggleItem: jest.fn(),
  isAllSelected: true,
  toggleAll: jest.fn(),
  handleDelete: jest.fn(),
  isDeleting: false,
};

jest.mock('@/features/watchlist/hooks/useWatchlistCleanup', () => ({
  useWatchlistCleanup: jest.fn(() => mockCleanup),
}));

import { useWatchlistCleanup } from '@/features/watchlist/hooks/useWatchlistCleanup';

// --- Tests ---

describe('WatchlistCleanupModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWatchlistCleanup as jest.Mock).mockReturnValue(mockCleanup);
  });

  it('対象作品のタイトルを表示する', () => {
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(screen.getByText('映画A')).toBeInTheDocument();
  });

  it('削除ボタンに件数が入る', () => {
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '3件を削除する' }),
    ).toBeInTheDocument();
  });

  it('削除ボタンを押すと handleDelete が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: '3件を削除する' }));

    expect(mockCleanup.handleDelete).toHaveBeenCalled();
  });

  it('作品のチェックを外すと toggleItem が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    await user.click(
      screen.getByRole('checkbox', { name: '映画Aを削除対象にする' }),
    );

    expect(mockCleanup.toggleItem).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('選択件数が0なら削除ボタンが無効になる', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      selectedCount: 0,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '0件を削除する' }),
    ).toBeDisabled();
  });

  it('削除中は削除ボタンが無効になる', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      isDeleting: true,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: '3件を削除する' }),
    ).toBeDisabled();
  });

  it('視聴済みが無いときは空状態を出し、削除ボタンを出さない', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      years: [],
      selectedYear: null,
      items: [],
      selectedCount: 0,
      totalCount: 0,
      isAllSelected: false,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(
      screen.getByText('整理できる視聴済みの作品がありません'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /件を削除する/ }),
    ).not.toBeInTheDocument();
  });

  it('キャンセルで onOpenChange(false) が呼ばれる', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(<WatchlistCleanupModal open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('キーボードで作品のチェックを操作できる', async () => {
    const user = userEvent.setup();
    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    const checkbox = screen.getByRole('checkbox', {
      name: '映画Aを削除対象にする',
    });
    checkbox.focus();
    await user.keyboard(' ');

    expect(mockCleanup.toggleItem).toHaveBeenCalled();
  });
});
