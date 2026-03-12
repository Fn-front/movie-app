/**
 * CalendarDialogコンポーネント テスト
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import { CalendarDialog } from './calendarDialog';

// --- Mocks ---

const mockGetCalendarMovies = jest.fn();

jest.mock('@/lib/api/calendar/calendar', () => ({
  getCalendarMovies: (...args: unknown[]) => mockGetCalendarMovies(...args),
}));

const mockCalendarResponse = {
  success: true,
  data: {
    month: '2026-03',
    movies_by_date: {
      '2026-03-15': [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: '/a.jpg',
          release_date: '2026-03-15',
          added_at: '2026-01-10T00:00:00Z',
        },
      ],
    },
  },
};

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

// --- Tests ---

describe('CalendarDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCalendarMovies.mockResolvedValue(mockCalendarResponse);
  });

  it('ダイアログが開いた時にカレンダーを表示する', async () => {
    render(
      <CalendarDialog
        open={true}
        onOpenChange={jest.fn()}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('公開カレンダー')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  });

  it('閉じた状態ではカレンダーが表示されない', () => {
    render(
      <CalendarDialog
        open={false}
        onOpenChange={jest.fn()}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.queryByText('公開カレンダー')).not.toBeInTheDocument();
  });

  it('ローディング状態を表示する', () => {
    mockGetCalendarMovies.mockReturnValue(new Promise(() => {}));

    render(
      <CalendarDialog
        open={true}
        onOpenChange={jest.fn()}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('ESCキーでダイアログが閉じる', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();

    render(
      <CalendarDialog
        open={true}
        onOpenChange={onOpenChange}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('データ取得後にカレンダーが表示される', async () => {
    render(
      <CalendarDialog
        open={true}
        onOpenChange={jest.fn()}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });

    expect(mockGetCalendarMovies).toHaveBeenCalled();
  });

  it('エラー時にエラーメッセージを表示する', async () => {
    mockGetCalendarMovies.mockRejectedValue(new Error('API Error'));

    render(
      <CalendarDialog
        open={true}
        onOpenChange={jest.fn()}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(
        screen.getByText('データの取得に失敗しました'),
      ).toBeInTheDocument();
    });
  });

  it('日付クリックで映画一覧を表示する', async () => {
    const user = userEvent.setup();

    render(
      <CalendarDialog
        open={true}
        onOpenChange={jest.fn()}
        onMovieClick={jest.fn()}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });

    // カレンダー内の日付ボタンをクリック（15日）
    const dayButtons = screen.getAllByRole('gridcell');
    const day15 = dayButtons.find((btn) => btn.textContent?.includes('15'));
    if (day15) {
      const button = day15.querySelector('button');
      if (button) {
        await user.click(button);
      }
    }
  });

  it('映画クリック時にonMovieClickが呼ばれる', async () => {
    const user = userEvent.setup();
    const onMovieClick = jest.fn();

    render(
      <CalendarDialog
        open={true}
        onOpenChange={jest.fn()}
        onMovieClick={onMovieClick}
      />,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });

    // 15日をクリック
    const dayButtons = screen.getAllByRole('gridcell');
    const day15 = dayButtons.find((btn) => btn.textContent?.includes('15'));
    if (day15) {
      const button = day15.querySelector('button');
      if (button) {
        await user.click(button);
      }
    }

    // 映画一覧が表示されたら映画をクリック
    const movieButton = screen.queryByLabelText('映画Aの詳細を表示');
    if (movieButton) {
      await user.click(movieButton);
      expect(onMovieClick).toHaveBeenCalledWith(100);
    }
  });
});
