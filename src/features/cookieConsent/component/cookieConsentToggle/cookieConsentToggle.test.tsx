/**
 * Cookie同意の撤回UIのテスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  getStoredConsentState,
  recordConsentDecision,
} from '@/utils/cookieConsent';
import { CookieConsentToggle } from './cookieConsentToggle';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

describe('CookieConsentToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  describe('表示条件', () => {
    it('同意済みなら表示する', () => {
      recordConsentDecision('granted', 'user-1');

      render(<CookieConsentToggle />);

      expect(
        screen.getByRole('radiogroup', { name: 'アクセス解析Cookieの利用' }),
      ).toBeInTheDocument();
    });

    it('拒否済みなら表示する', () => {
      recordConsentDecision('denied', 'user-1');

      render(<CookieConsentToggle />);

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('未決定なら表示しない（未選択を2択で表せないため）', () => {
      render(<CookieConsentToggle />);

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });

    it('GA ID が無効でも保存済みの同意があれば表示する', () => {
      // 運用側が計測を止めたときに、同意済みの利用者の撤回手段だけが
      // 消えるのを防ぐ
      delete process.env.NEXT_PUBLIC_GA_ID;
      recordConsentDecision('granted', 'user-1');

      render(<CookieConsentToggle />);

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('GA ID が無効で未決定なら表示しない', () => {
      delete process.env.NEXT_PUBLIC_GA_ID;

      render(<CookieConsentToggle />);

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    });
  });

  describe('選択状態', () => {
    it('保存済みの値が選択されている', () => {
      recordConsentDecision('denied', 'user-1');

      render(<CookieConsentToggle />);

      expect(screen.getByRole('radio', { name: '同意しない' })).toBeChecked();
      expect(screen.getByRole('radio', { name: '同意する' })).not.toBeChecked();
    });
  });

  describe('撤回', () => {
    it('同意済みから「同意しない」へ切り替えられる', async () => {
      const user = userEvent.setup();
      recordConsentDecision('granted', 'user-1');

      render(<CookieConsentToggle />);
      await user.click(screen.getByRole('radio', { name: '同意しない' }));

      expect(getStoredConsentState()).toBe('denied');
      expect(screen.getByRole('radio', { name: '同意しない' })).toBeChecked();
    });

    it('拒否済みから「同意する」へ戻せる', async () => {
      const user = userEvent.setup();
      recordConsentDecision('denied', 'user-1');

      render(<CookieConsentToggle />);
      await user.click(screen.getByRole('radio', { name: '同意する' }));

      expect(getStoredConsentState()).toBe('granted');
    });

    it('GA ID が無効でも撤回できる', async () => {
      const user = userEvent.setup();
      delete process.env.NEXT_PUBLIC_GA_ID;
      recordConsentDecision('granted', 'user-1');

      render(<CookieConsentToggle />);
      await user.click(screen.getByRole('radio', { name: '同意しない' }));

      expect(getStoredConsentState()).toBe('denied');
    });
  });
});
