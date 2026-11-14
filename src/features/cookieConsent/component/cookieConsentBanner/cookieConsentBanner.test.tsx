/**
 * Cookie同意バナーのテスト
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ARIA_LABELS, COOKIE_CONSENT_VERSION, ROUTES } from '@/constants';
import {
  getStoredConsentRecord,
  getStoredConsentState,
  recordConsentDecision,
} from '@/utils/cookieConsent';
import {
  __resetBannerSuppressionForTest,
  markSigningOut,
  setConsentSyncPending,
} from '../../utils/bannerSuppression';
import { CookieConsentBanner } from './cookieConsentBanner';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
    __resetBannerSuppressionForTest();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  /**
   * 同意状態が確定するまで出さない（#1137 / #1133）
   *
   * localStorage が「未決定」でも最終的な答えとは限らない。サーバー同期の
   * 往復中はサーバー側の記録が降りてくるかもしれず、ログアウト中はもう
   * 画面を離れる
   */
  describe('抑止', () => {
    it('サーバー同期の応答待ちでは表示しない', () => {
      setConsentSyncPending(true);

      render(<CookieConsentBanner />);

      expect(
        screen.queryByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).not.toBeInTheDocument();
    });

    it('ログアウト処理中は表示しない', () => {
      markSigningOut();

      render(<CookieConsentBanner />);

      expect(
        screen.queryByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).not.toBeInTheDocument();
    });

    it('抑止が解けたら表示する', () => {
      setConsentSyncPending(true);
      render(<CookieConsentBanner />);

      act(() => {
        setConsentSyncPending(false);
      });

      expect(
        screen.getByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).toBeInTheDocument();
    });
  });

  describe('表示条件', () => {
    it('GA ID 有効かつ未決定なら表示する', () => {
      render(<CookieConsentBanner />);

      expect(
        screen.getByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).toBeInTheDocument();
    });

    it('同意済みなら表示しない', () => {
      recordConsentDecision('granted', 'user-1');

      render(<CookieConsentBanner />);

      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('拒否済みなら表示しない', () => {
      recordConsentDecision('denied', 'user-1');

      render(<CookieConsentBanner />);

      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('GA ID が未設定なら表示しない（同意を求める対象が無い）', () => {
      delete process.env.NEXT_PUBLIC_GA_ID;

      render(<CookieConsentBanner />);

      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('GA ID が不正な形式なら表示しない', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_GA_ID = 'invalid';

      render(<CookieConsentBanner />);

      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });
  });

  describe('操作', () => {
    it('「同意する」で granted を記録し、バナーが消える', async () => {
      // 「消えたこと」だけを見ると、2つのハンドラを取り違えても通ってしまう。
      // 同意ボタンが拒否を記録する実装が CI を素通りするのは実害が大きい
      const user = userEvent.setup();
      render(<CookieConsentBanner />);

      await user.click(screen.getByRole('button', { name: '同意する' }));

      expect(getStoredConsentState()).toBe('granted');
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('「同意しない」で denied を記録し、バナーが消える', async () => {
      const user = userEvent.setup();
      render(<CookieConsentBanner />);

      await user.click(screen.getByRole('button', { name: '同意しない' }));

      expect(getStoredConsentState()).toBe('denied');
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('操作した利用者と現行版を添えて記録する', async () => {
      const user = userEvent.setup();
      render(<CookieConsentBanner />);

      await user.click(screen.getByRole('button', { name: '同意する' }));

      const record = getStoredConsentRecord();
      expect(record.owner).toBe('user-1');
      expect(record.version).toBe(COOKIE_CONSENT_VERSION);
      expect(record.at).not.toBeNull();
    });

    it('キーボードで両方のボタンへ到達できる', async () => {
      const user = userEvent.setup();
      render(<CookieConsentBanner />);

      await user.tab();
      // DOM 順は 説明文のリンク → 同意しない → 同意する
      expect(
        screen.getByRole('link', { name: 'プライバシーポリシー' }),
      ).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: '同意しない' })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: '同意する' })).toHaveFocus();
    });
  });

  describe('ダークパターンの回避', () => {
    it('閉じるボタンを置かない', () => {
      render(<CookieConsentBanner />);

      expect(
        screen.queryByRole('button', { name: '閉じる' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('2つの選択肢を同じ見た目にする', () => {
      render(<CookieConsentBanner />);

      const deny = screen.getByRole('button', { name: '同意しない' });
      const grant = screen.getByRole('button', { name: '同意する' });

      expect(deny.className).toBe(grant.className);
    });
  });

  describe('導線', () => {
    it('プライバシーポリシーへリンクする', () => {
      render(<CookieConsentBanner />);

      expect(
        screen.getByRole('link', { name: 'プライバシーポリシー' }),
      ).toHaveAttribute('href', ROUTES.PRIVACY);
    });
  });
});
