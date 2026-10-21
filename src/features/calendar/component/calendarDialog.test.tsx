/**
 * CalendarDialogコンポーネント テスト
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createElement,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react';

import { CalendarDialog } from './calendarDialog';

// --- Mocks ---

const mockGetCalendarMovies = jest.fn();

jest.mock('@/lib/api/calendar/calendar', () => ({
  getCalendarMovies: (...args: unknown[]) => mockGetCalendarMovies(...args),
}));

// FullCalendarのモック
const mockDateClick = jest.fn();
const mockDayCellClassNames = jest.fn();
const mockMoreLinkDidMount = jest.fn();
const mockDayCellDidMount = jest.fn();
const mockEventClick = jest.fn();
const mockDatesSet = jest.fn();
const mockCalendarApi = {
  prev: jest.fn(),
  next: jest.fn(),
  today: jest.fn(),
  updateSize: jest.fn(),
};

jest.mock('@fullcalendar/react', () => {
  const MockFullCalendar = forwardRef<
    { getApi: () => typeof mockCalendarApi },
    {
      events?: Array<{ id: string; title: string; start: string }>;
      dateClick?: (arg: { date: Date; dateStr: string }) => void;
      datesSet?: (arg: { view: { currentStart: Date } }) => void;
      dayCellClassNames?: (arg: { date: Date }) => string[];
      moreLinkDidMount?: (arg: { el: HTMLElement }) => void;
      dayCellDidMount?: (arg: { el: HTMLElement; date: Date }) => void;
      eventClick?: (arg: { event: { start: Date | null } }) => void;
    }
  >(function MockFullCalendar(props, ref) {
    mockDateClick.mockImplementation(props.dateClick);
    mockDayCellClassNames.mockImplementation(props.dayCellClassNames);
    mockMoreLinkDidMount.mockImplementation(props.moreLinkDidMount);
    mockDayCellDidMount.mockImplementation(props.dayCellDidMount);
    mockEventClick.mockImplementation(props.eventClick);
    mockDatesSet.mockImplementation(props.datesSet);
    useImperativeHandle(ref, () => ({ getApi: () => mockCalendarApi }));
    return (
      <div data-testid='fullcalendar'>
        {props.events?.map((event) => (
          <div key={event.id} data-testid={`event-${event.id}`}>
            {event.title}
          </div>
        ))}
      </div>
    );
  });
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

    expect(screen.getByTestId('event-wl-1')).toHaveTextContent('映画A');
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

    // モックされたdateClickコールバックが設定されていることを確認
    const dateClickHandler = mockDateClick.getMockImplementation();
    expect(dateClickHandler).toBeDefined();

    // dateClickコールバックを呼び出して日付選択をシミュレート
    await act(async () => {
      dateClickHandler!({
        date: new Date(2026, 2, 15),
        dateStr: '2026-03-15',
      });
    });

    // 選択日の映画一覧が表示される
    await waitFor(() => {
      expect(screen.getByText('3月15日(日)（1件）')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('映画A')).toBeInTheDocument();
  });

  it('日付未選択でも表示中の月の公開予定を一覧表示する', async () => {
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

    const currentMonthLabel = `${new Date().getMonth() + 1}月の公開予定（1件）`;
    expect(screen.getByText(currentMonthLabel)).toBeInTheDocument();
    expect(screen.getByLabelText('映画A')).toBeInTheDocument();
  });

  it('「今日」ボタンで当月へ戻る', async () => {
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

    await user.click(screen.getByRole('button', { name: '今日' }));

    expect(mockCalendarApi.today).toHaveBeenCalled();
  });

  it('選択日のセルにだけ選択状態のクラスを付与する', async () => {
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

    // 未選択ならどの日にも付かない
    expect(
      mockDayCellClassNames({ date: new Date(2026, 2, 15) }),
    ).not.toContain('fc-day-selected');

    await act(async () => {
      mockDateClick.getMockImplementation()!({
        date: new Date(2026, 2, 15),
        dateStr: '2026-03-15',
      });
    });

    expect(mockDayCellClassNames({ date: new Date(2026, 2, 15) })).toContain(
      'fc-day-selected',
    );
    expect(
      mockDayCellClassNames({ date: new Date(2026, 2, 16) }),
    ).not.toContain('fc-day-selected');
  });

  describe('出現アニメーション後の幅の測り直し', () => {
    // モーダルは scale(0.96) から開く（modal.module.scss の contentShow）。
    // FullCalendar がその最中に幅を測ると、縮んだ幅がテーブルに焼き込まれて
    // 土曜カラムの右に余白が残るため、拡大が終わってから測り直させる。
    const originalGetBoundingClientRect =
      Element.prototype.getBoundingClientRect;
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetWidth',
    );

    afterEach(() => {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      if (originalOffsetWidth) {
        Object.defineProperty(
          HTMLElement.prototype,
          'offsetWidth',
          originalOffsetWidth,
        );
      }
    });

    it('描画幅が落ち着いたらサイズを測り直す', async () => {
      render(
        <CalendarDialog
          open={true}
          onOpenChange={jest.fn()}
          onMovieClick={jest.fn()}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(mockCalendarApi.updateSize).toHaveBeenCalled();
      });
    });

    it('拡大の途中では測り直さない', async () => {
      // レイアウト幅 798 に対し、transform 込みの実測が 766（= 798 × 0.96）の状態
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        value: 798,
      });
      Element.prototype.getBoundingClientRect = () =>
        ({
          width: 766,
          height: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;

      render(
        <CalendarDialog
          open={true}
          onOpenChange={jest.fn()}
          onMovieClick={jest.fn()}
        />,
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(screen.getByTestId('fullcalendar')).toBeInTheDocument();
      });

      // 数フレーム進めても幅が変わり続けている間は測り直さない
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(mockCalendarApi.updateSize).not.toHaveBeenCalled();
    });
  });

  it('前月・次月ボタンでカレンダーの月送りが呼ばれる', async () => {
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

    await user.click(screen.getByRole('button', { name: '前月' }));
    expect(mockCalendarApi.prev).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '次月' }));
    expect(mockCalendarApi.next).toHaveBeenCalled();
  });

  it('イベントをクリックするとその公開日が選択される', async () => {
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

    await act(async () => {
      mockEventClick.getMockImplementation()!({
        event: { start: new Date(2026, 2, 15) },
      });
    });

    expect(screen.getByText('3月15日(日)（1件）')).toBeInTheDocument();
  });

  it('開始日を持たないイベントのクリックは無視する', async () => {
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

    await act(async () => {
      mockEventClick.getMockImplementation()!({ event: { start: null } });
    });

    // 月全体の一覧のまま（選択日の見出しにならない）
    const currentMonthLabel = `${new Date().getMonth() + 1}月の公開予定（1件）`;
    expect(screen.getByText(currentMonthLabel)).toBeInTheDocument();
  });

  it('カレンダー側の月変更が表示月に反映される', async () => {
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

    const nextMonth = new Date();
    nextMonth.setDate(1);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    await act(async () => {
      mockDatesSet.getMockImplementation()!({
        view: { currentStart: nextMonth },
      });
    });

    // 月が変わるとクエリキーも変わるため、再取得が落ち着くのを待つ
    await waitFor(() => {
      expect(
        screen.getByText(
          nextMonth.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
          }),
        ),
      ).toBeInTheDocument();
    });
  });

  it('一覧の映画クリックでonMovieClickが呼ばれる', async () => {
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

    await user.click(screen.getByLabelText('映画A'));

    expect(onMovieClick).toHaveBeenCalledWith(100);
  });

  it('日セルのaria-labelledbyを外してセル内容から名前を取らせる', async () => {
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

    // FullCalendar は日セルの名前を日付だけに固定する。
    // 外して内容から名前を取らせると、その日の作品名まで読み上げられる
    const cell = document.createElement('td');
    cell.setAttribute('aria-labelledby', 'fc-dom-1');

    mockDayCellDidMount.getMockImplementation()!({
      el: cell,
      date: new Date(2026, 2, 15),
    });

    expect(cell.hasAttribute('aria-labelledby')).toBe(false);
    expect(cell.hasAttribute('aria-label')).toBe(false);
  });

  it('「他N件」リンクにrole=buttonを補う', async () => {
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

    // FullCalendar は href も role も無い <a> に aria-expanded を付けるため、
    // そのままだと generic ロールに許可されない属性になる
    const link = document.createElement('a');
    link.setAttribute('aria-expanded', 'false');

    mockMoreLinkDidMount.getMockImplementation()!({ el: link });

    expect(link.getAttribute('role')).toBe('button');
  });

  it('公開予定がある日のセルにだけイベントありのクラスを付与する', async () => {
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

    expect(mockDayCellClassNames({ date: new Date(2026, 2, 15) })).toContain(
      'fc-day-has-events',
    );
    expect(
      mockDayCellClassNames({ date: new Date(2026, 2, 16) }),
    ).not.toContain('fc-day-has-events');
  });
});
