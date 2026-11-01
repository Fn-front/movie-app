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
      has_favorite: true,
    },
  ],
  isItemsLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  selectedCount: 3,
  totalCount: 3,
  unratedCount: 0,
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

  describe('お気に入り未登録の注意喚起', () => {
    it('未登録があるとき件数付きの注意書きを出す', () => {
      (useWatchlistCleanup as jest.Mock).mockReturnValue({
        ...mockCleanup,
        unratedCount: 5,
      });

      render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

      expect(
        screen.getByText(
          'お気に入り未登録の5件は、削除すると視聴した記録が残りません',
        ),
      ).toBeInTheDocument();
    });

    it('未登録が0件なら注意書きを出さない', () => {
      (useWatchlistCleanup as jest.Mock).mockReturnValue({
        ...mockCleanup,
        unratedCount: 0,
      });

      render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

      expect(
        screen.queryByText(/削除すると視聴した記録が残りません/),
      ).toBeNull();
    });

    it('未登録の行に「未評価」の印を出す', () => {
      (useWatchlistCleanup as jest.Mock).mockReturnValue({
        ...mockCleanup,
        unratedCount: 1,
        items: [{ ...mockCleanup.items[0], has_favorite: false }],
      });

      render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

      expect(screen.getByText('未評価')).toBeInTheDocument();
    });

    it('お気に入り登録済みの行には印を出さない', () => {
      (useWatchlistCleanup as jest.Mock).mockReturnValue({
        ...mockCleanup,
        items: [{ ...mockCleanup.items[0], has_favorite: true }],
      });

      render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

      expect(screen.queryByText('未評価')).toBeNull();
    });

    it('削除はブロックしない（未登録があっても削除ボタンは押せる）', () => {
      (useWatchlistCleanup as jest.Mock).mockReturnValue({
        ...mockCleanup,
        unratedCount: 3,
      });

      render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

      expect(
        screen.getByRole('button', { name: '3件を削除する' }),
      ).toBeEnabled();
    });
  });

  it('年一覧の読み込み中は対象リストを出さない', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      isYearsLoading: true,
      years: [],
      items: [],
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(screen.queryByText('映画A')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /件を削除する/ }),
    ).not.toBeInTheDocument();
  });

  it('対象リストの読み込み中は作品を出さない', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      isItemsLoading: true,
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    expect(screen.queryByText('映画A')).not.toBeInTheDocument();
    // 削除ボタンは出たままにする（件数はサーバーの集計値で分かっている）
    expect(
      screen.getByRole('button', { name: '3件を削除する' }),
    ).toBeInTheDocument();
  });

  it('ポスターがある作品は画像を表示する', () => {
    (useWatchlistCleanup as jest.Mock).mockReturnValue({
      ...mockCleanup,
      items: [{ ...mockCleanup.items[0], poster_path: '/poster.jpg' }],
    });

    render(<WatchlistCleanupModal open onOpenChange={jest.fn()} />);

    // 同じ行にタイトルがあるため alt は空（装飾的な画像）
    const image = document.querySelector('img');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('alt', '');
  });

  it('モーダルが閉じているときはフックのクエリを止める', () => {
    render(<WatchlistCleanupModal open={false} onOpenChange={jest.fn()} />);

    expect(useWatchlistCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
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
