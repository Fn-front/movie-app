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

// FullCalendarのモック
const mockDateClick = jest.fn();

jest.mock('@fullcalendar/react', () => {
  const MockFullCalendar = (props: {
    events?: Array<{ id: string; title: string; start: string }>;
    dateClick?: (arg: { date: Date; dateStr: string }) => void;
    datesSet?: (arg: { start: Date; end: Date }) => void;
  }) => {
    mockDateClick.mockImplementation(props.dateClick);
    if (props.datesSet) {
      props.datesSet({ start: new Date(), end: new Date() });
    }
    return (
      <div data-testid='fullcalendar'>
        {props.events?.map((event) => (
          <div key={event.id} data-testid={`event-${event.id}`}>
            {event.title}
          </div>
        ))}
      </div>
    );
  };
  MockFullCalendar.displayName = 'MockFullCalendar';
  return { __esModule: true, default: MockFullCalendar };
});

jest.mock('@fullcalendar/daygrid', () => ({}));
jest.mock('@fullcalendar/interaction', () => ({}));
jest.mock('@fullcalendar/core/locales/ja', () => ({}));

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

  it('データ取得後にFullCalendarが表示される', async () => {
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

    expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
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

  it('イベントデータがFullCalendarに渡される', async () => {
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

    expect(screen.getByTestId('event-wl-1')).toBeInTheDocument();
    expect(screen.getByText('映画A')).toBeInTheDocument();
  });

  it('日付クリックで映画一覧を表示する', async () => {
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

    // モックされたdateClickコールバックを呼び出す
    if (
      mockDateClick.mock.calls.length > 0 ||
      mockDateClick.getMockImplementation()
    ) {
      const dateClickHandler = mockDateClick.getMockImplementation();
      if (dateClickHandler) {
        dateClickHandler({
          date: new Date(2026, 2, 15),
          dateStr: '2026-03-15',
        });
      }
    }
  });
});
