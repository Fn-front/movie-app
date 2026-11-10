/**
 * ハイドレーション前（`unknown`）の挙動のテスト
 *
 * `getServerSnapshot` が返す `unknown` は「まだ localStorage を読めていない」
 * という意味で、同意の意思表示ではない。ここで `denied` を送ると、同意済み
 * 利用者のハイドレーション時に `analytics_storage` が一瞬落ちる。
 *
 * RTL の `render()` はクライアントレンダーなので `getServerSnapshot` を
 * 通らず、通常のテストではこの状態を再現できない。フックをモックして
 * `unknown` 固定にするため、ファイルを分けている。
 */

import { render } from '@testing-library/react';

import { AnalyticsProvider } from './analyticsProvider';

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: jest.fn() }),
  useToastDispatch: () => ({ toast: jest.fn() }),
}));

jest.mock('@/lib/api/user/user', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

// ハイドレート前を固定で再現する
jest.mock('@/hooks/useCookieConsent', () => ({
  useCookieConsent: () => ({
    consent: 'unknown',
    grant: jest.fn(),
    deny: jest.fn(),
  }),
}));

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

let gtagCalls: unknown[][] = [];

describe('AnalyticsProvider（ハイドレーション前）', () => {
  beforeEach(() => {
    gtagCalls = [];
    delete window.dataLayer;
    window.gtag = (...args: unknown[]) => {
      gtagCalls.push(args);
    };
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 0;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  it('consent update を送らない', () => {
    render(<AnalyticsProvider />);

    const updates = gtagCalls.filter(
      (args) => args[0] === 'consent' && args[1] === 'update',
    );
    expect(updates).toHaveLength(0);
  });

  it('_ga を消さない', () => {
    document.cookie = '_ga=GA1.1.123';

    render(<AnalyticsProvider />);

    expect(document.cookie).toContain('_ga=');
  });

  it('page_view は送る（同意状態に関係なく計上する）', () => {
    // Consent Mode advanced では未同意でも cookieless で送られる
    render(<AnalyticsProvider />);

    const pageViews = gtagCalls.filter(
      (args) => args[0] === 'event' && args[1] === 'page_view',
    );
    expect(pageViews).toHaveLength(1);
  });
});
