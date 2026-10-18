const mockUseSession = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

jest.mock('next/link', () => {
  const MockLink = ({
    children,
    href,
    ...props
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
  MockLink.displayName = 'MockLink';
  return { __esModule: true, default: MockLink };
});

jest.mock('next/image', () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt='' {...props} />;
  };
  MockImage.displayName = 'MockImage';
  return { __esModule: true, default: MockImage };
});

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock(
  '@/features/watchlist/component/watchlistPanel/watchlistPanel',
  () => ({
    WatchlistPanel: () => (
      <div data-testid='watchlist-panel'>WatchlistPanel</div>
    ),
  }),
);

jest.mock('@/features/calendar/component/calendarButton', () => ({
  CalendarButton: () => <div data-testid='calendar-button'>CalendarButton</div>,
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MAIN_CONTENT_ID } from '@/constants';

import { AppLayout } from './appLayout';

// --- Helpers ---

const authenticatedSession = {
  data: {
    user: {
      name: 'テストユーザー',
      email: 'test@example.com',
      image: null,
    },
  },
  status: 'authenticated',
};

const unauthenticatedSession = {
  data: null,
  status: 'unauthenticated',
};

// --- Tests ---

describe('AppLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue(authenticatedSession);
  });

  it('デフォルトpropsでレンダリングされる', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('childrenがmain要素内に表示される', () => {
    render(<AppLayout>テストコンテンツ</AppLayout>);
    expect(screen.getByRole('main')).toHaveTextContent('テストコンテンツ');
  });

  it('Headerが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('Footerが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('デフォルトでサイドバーが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('showSidebar=falseでサイドバーが非表示になる', () => {
    render(<AppLayout showSidebar={false}>コンテンツ</AppLayout>);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('ロゴリンクが表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('link', { name: 'Movie App' })).toBeInTheDocument();
  });

  it('SearchBarがHeader内に表示される', () => {
    render(<AppLayout>コンテンツ</AppLayout>);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByLabelText('映画を検索')).toBeInTheDocument();
  });

  describe('認証状態による表示制御', () => {
    it('認証済みの場合WatchlistPanelが表示される', () => {
      mockUseSession.mockReturnValue(authenticatedSession);
      render(<AppLayout>コンテンツ</AppLayout>);
      expect(screen.getByTestId('watchlist-panel')).toBeInTheDocument();
    });

    it('認証済みの場合CalendarButtonが表示される', () => {
      mockUseSession.mockReturnValue(authenticatedSession);
      render(<AppLayout>コンテンツ</AppLayout>);
      expect(screen.getByTestId('calendar-button')).toBeInTheDocument();
    });

    it('未認証の場合WatchlistPanelが表示されない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      render(<AppLayout>コンテンツ</AppLayout>);
      expect(screen.queryByTestId('watchlist-panel')).not.toBeInTheDocument();
    });

    it('未認証の場合CalendarButtonが表示されない', () => {
      mockUseSession.mockReturnValue(unauthenticatedSession);
      render(<AppLayout>コンテンツ</AppLayout>);
      expect(screen.queryByTestId('calendar-button')).not.toBeInTheDocument();
    });
  });

  describe('スキップリンク', () => {
    it('本文へ移動するリンクが表示される', () => {
      render(<AppLayout>コンテンツ</AppLayout>);
      expect(
        screen.getByRole('link', { name: '本文へ移動' }),
      ).toBeInTheDocument();
    });

    it('main要素のidを参照している', () => {
      render(<AppLayout>コンテンツ</AppLayout>);
      const skipLink = screen.getByRole('link', { name: '本文へ移動' });
      const main = screen.getByRole('main');

      expect(skipLink).toHaveAttribute('href', `#${main.id}`);
      expect(main.id).toBe(MAIN_CONTENT_ID);
    });

    it('mainがプログラム的なフォーカスを受けられる', () => {
      render(<AppLayout>コンテンツ</AppLayout>);
      expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
    });

    it('DOM上で最初のフォーカス可能要素になっている', async () => {
      const user = userEvent.setup();
      render(<AppLayout>コンテンツ</AppLayout>);

      await user.tab();
      expect(screen.getByRole('link', { name: '本文へ移動' })).toHaveFocus();
    });
  });
});
