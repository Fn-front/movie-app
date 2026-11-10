/**
 * 同意状態の gtag への反映のテスト（設計書 §5.6 の遷移表）
 */

import { act, render } from '@testing-library/react';

import { recordConsentDecision } from '@/utils/cookieConsent';
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

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/** gtag への呼び出しを記録する */
let gtagCalls: unknown[][] = [];

/** consent update の引数だけを拾う */
const consentUpdates = () =>
  gtagCalls.filter((args) => args[0] === 'consent' && args[1] === 'update');

/** page_view の引数だけを拾う */
const pageViews = () =>
  gtagCalls.filter((args) => args[0] === 'event' && args[1] === 'page_view');

describe('AnalyticsProvider（同意状態の反映）', () => {
  beforeEach(() => {
    localStorage.clear();
    gtagCalls = [];
    delete window.dataLayer;
    window.gtag = (...args: unknown[]) => {
      gtagCalls.push(args);
    };
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
    // page_view は rAF 越しに送られるので即時実行にする
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

  describe('遷移表', () => {
    it('unknown → granted では update を送るが page_view は足さない', () => {
      // 再訪問者のハイドレーション。pathname の effect が既に送っている
      recordConsentDecision('granted', '');

      render(<AnalyticsProvider />);

      expect(consentUpdates()).toHaveLength(1);
      expect(consentUpdates()[0][2]).toEqual({ analytics_storage: 'granted' });
      expect(pageViews()).toHaveLength(1);
    });

    it('unset → granted では update のみ送り、page_view は再送しない', () => {
      // Consent Mode advanced では未同意でも Cookie を伴わない page_view が
      // 既に送られている。同意成立で送り直すと同じ閲覧が2件になる
      render(<AnalyticsProvider />);
      const before = pageViews().length;

      act(() => {
        recordConsentDecision('granted', '');
      });

      expect(consentUpdates().at(-1)?.[2]).toEqual({
        analytics_storage: 'granted',
      });
      expect(pageViews().length).toBe(before);
    });

    it('unset → denied では update のみ', () => {
      render(<AnalyticsProvider />);
      const before = pageViews().length;

      act(() => {
        recordConsentDecision('denied', '');
      });

      expect(consentUpdates().at(-1)?.[2]).toEqual({
        analytics_storage: 'denied',
      });
      expect(pageViews().length).toBe(before);
    });

    it('granted → denied では denied を送り _ga を消す', () => {
      recordConsentDecision('granted', '');
      document.cookie = '_ga=GA1.1.123';
      render(<AnalyticsProvider />);

      act(() => {
        recordConsentDecision('denied', '');
      });

      expect(consentUpdates().at(-1)?.[2]).toEqual({
        analytics_storage: 'denied',
      });
      expect(document.cookie).not.toContain('_ga=');
    });

    it('granted → unset（ログアウト・版の切り上げ）でも denied を送る', () => {
      // 表から漏らすと、ログアウト後も同一セッションの間 GA が granted の
      // まま動き続ける
      recordConsentDecision('granted', '');
      render(<AnalyticsProvider />);
      gtagCalls = [];

      act(() => {
        localStorage.clear();
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'movie-app:cookie-consent' }),
        );
      });

      expect(consentUpdates().at(-1)?.[2]).toEqual({
        analytics_storage: 'denied',
      });
    });
  });

  describe('順序', () => {
    it('consent update を送ってから _ga を消す', () => {
      // 逆順だと、キューに残ったヒットが削除直後に _ga を書き戻しうる
      recordConsentDecision('granted', '');
      document.cookie = '_ga=GA1.1.123';
      render(<AnalyticsProvider />);

      const order: string[] = [];
      window.gtag = (...args: unknown[]) => {
        gtagCalls.push(args);
        if (args[1] === 'update') order.push('update');
      };
      const descriptor = Object.getOwnPropertyDescriptor(
        Document.prototype,
        'cookie',
      );
      jest
        .spyOn(document, 'cookie', 'set')
        .mockImplementation((value: string) => {
          if (value.startsWith('_ga')) order.push('delete');
          descriptor?.set?.call(document, value);
        });

      act(() => {
        recordConsentDecision('denied', '');
      });

      expect(order[0]).toBe('update');
      expect(order).toContain('delete');
    });
  });

  describe('GA ID が無効なとき', () => {
    it('gtag が未定義でも撤回で落ちず、Cookie 削除は行う', () => {
      delete process.env.NEXT_PUBLIC_GA_ID;
      delete window.gtag;
      recordConsentDecision('granted', '');
      document.cookie = '_ga=GA1.1.123';

      render(<AnalyticsProvider />);

      expect(() => {
        act(() => {
          recordConsentDecision('denied', '');
        });
      }).not.toThrow();
      expect(document.cookie).not.toContain('_ga=');
    });
  });
});
