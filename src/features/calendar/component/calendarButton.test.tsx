/**
 * CalendarButtonコンポーネント テスト
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import { CalendarButton } from './calendarButton';

// --- Mocks ---

const mockGetCalendarMovies = jest.fn();

jest.mock('@/lib/api/calendar/calendar', () => ({
  getCalendarMovies: (...args: unknown[]) => mockGetCalendarMovies(...args),
}));

jest.mock('@fullcalendar/react', () => {
  const MockFullCalendar = () => <div data-testid='fullcalendar' />;
  MockFullCalendar.displayName = 'MockFullCalendar';
  return { __esModule: true, default: MockFullCalendar };
});
jest.mock('@fullcalendar/daygrid', () => ({}));
jest.mock('@fullcalendar/interaction', () => ({}));
jest.mock('@fullcalendar/core/locales/ja', () => ({}));
jest.mock('@fullcalendar/core', () => ({}));

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
        Movie {movieId}
        <button data-testid='close-modal' onClick={onClose}>
          閉じる
        </button>
      </div>
    ) : null,
}));

const mockCalendarResponse = {
  success: true,
  data: {
    month: '2026-03',
    movies_by_date: {},
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

describe('CalendarButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCalendarMovies.mockResolvedValue(mockCalendarResponse);
  });

  it('カレンダーボタンを表示する', () => {
    render(<CalendarButton />, { wrapper: createWrapper() });

    expect(
      screen.getByRole('button', { name: '公開カレンダーを開く' }),
    ).toBeInTheDocument();
    expect(screen.getByText('公開カレンダー')).toBeInTheDocument();
  });

  it('ボタンクリックでダイアログが開く', async () => {
    const user = userEvent.setup();

    render(<CalendarButton />, { wrapper: createWrapper() });

    await user.click(
      screen.getByRole('button', { name: '公開カレンダーを開く' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('ダイアログを閉じることができる', async () => {
    const user = userEvent.setup();

    render(<CalendarButton />, { wrapper: createWrapper() });

    // ダイアログを開く
    await user.click(
      screen.getByRole('button', { name: '公開カレンダーを開く' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // ESCで閉じる
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
