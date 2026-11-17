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
import { BANNER_HEIGHT_VAR } from '../../utils/bannerHeight';
import { CookieConsentBanner } from './cookieConsentBanner';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

/** 現在のパス。テストごとに差し替える */
let mockPathname: string | null = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
    __resetBannerSuppressionForTest();
    mockPathname = '/';
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

  /**
   * 認証フローの画面では出さない（#1229）
   *
   * メールのリンクなどから1つの作業を終えるために来る場所なので、
   * 無関係な同意の判断を割り込ませない。既定が `denied` で Cookie を
   * 書かないため、聞くのを後ろへ倒せる
   */
  describe('認証フローのルート', () => {
    it.each([
      ['ログイン', ROUTES.LOGIN],
      ['パスワード再設定', ROUTES.RESET_PASSWORD],
      ['二段階認証', ROUTES.TOTP_CHALLENGE],
    ])('%s では表示しない', (_label, route) => {
      mockPathname = route;

      render(<CookieConsentBanner />);

      expect(
        screen.queryByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).not.toBeInTheDocument();
    });

    it('抜けた先では出る（同意状態を記録しないので聞き直せる）', () => {
      // ⚠️ 「同意状態が unset のまま」だけを見ると、ボタンを押さない限り
      // 常に真なので**判定を丸ごと外しても通る**。認証ルートで出ないことと
      // 抜けた先で出ることを対にして、初めて退行を捕まえられる
      mockPathname = ROUTES.RESET_PASSWORD;
      const { unmount } = render(<CookieConsentBanner />);

      expect(
        screen.queryByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).not.toBeInTheDocument();
      unmount();

      mockPathname = '/';
      render(<CookieConsentBanner />);

      expect(
        screen.getByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).toBeInTheDocument();
      expect(getStoredConsentState()).toBe('unset');
    });

    it('高さの CSS 変数を残さない', () => {
      // 枠だけ残すと本文とボトムナビの位置がずれる
      mockPathname = ROUTES.RESET_PASSWORD;

      render(<CookieConsentBanner />);

      expect(
        document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
      ).toBe('');
    });

    it('バナーからのリンク先であるプライバシーポリシーでは表示する', () => {
      // ここで消えると、同意の判断材料を読みに行った先で戻る導線を失う
      mockPathname = ROUTES.PRIVACY;

      render(<CookieConsentBanner />);

      expect(
        screen.getByRole('region', { name: ARIA_LABELS.COOKIE_BANNER }),
      ).toBeInTheDocument();
    });
  });

  /**
   * 高さの CSS 変数を**ペイント前**に書く（#1155）
   *
   * `--cookie-banner-height` は本文の `padding-bottom`、ボトムナビの
   * `bottom`、レイアウトの `height` の3つが読んでいる。既定は 0px なので、
   * 書き込みがペイント後だと1フレームぶん全部が跳ねる。特にボトムナビは
   * バナーの裏に潜って押せなくなる。
   *
   * ⚠️ jsdom の ResizeObserver はダミー（`jest.setup.js`）でコールバックを
   * 発火しない。つまり**同期書き込みが無いと変数は一度も設定されない**ので、
   * ここで「設定されていること」を見れば同期書き込みの有無を検証できる。
   * 実際の高さは jsdom がレイアウトしないため 0 になる。
   *
   * ⚠️ ここで守れるのは**同期書き込みがあること**だけ。#1155 はそれと
   * 「ペイント前に走ること」の合成バグで、後者は jsdom にペイントが無い以上
   * テストでは守れない。`useIsomorphicLayoutEffect` を `useEffect` に戻しても
   * このファイルは全件通る（実測）。依存配列のほうは eslint の
   * `exhaustive-deps` に `additionalHooks` で拾わせてある
   */
  describe('高さの CSS 変数', () => {
    it('描画した時点で既に書かれている（ResizeObserver を待たない）', () => {
      render(<CookieConsentBanner />);

      // 値まで見る。単位落ちや Math.ceil 抜けも同時に捕まえる
      expect(
        document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
      ).toBe('0px');
    });

    /**
     * ⚠️ **抑止が解けて出てきた場合も書くこと。**
     *
     * 上のテストは最初から表示される経路しか通らないため、依存配列が `[]`
     * でも通ってしまう。実際にそれで main を壊した（#1160）。本番では
     * サーバー同期の応答待ちで一度抑止されるので、**バナーが出るのは
     * ほぼ必ず2回目以降のレンダー**。初回だけ走る実装では一度も書かれない。
     *
     * 依存配列に `isVisible` が要るのに、効果の本体が `isVisible` を参照
     * しないため `exhaustive-deps` も警告しない。テストで固定するしかない
     */
    it('抑止が解けて表示されたときも書かれる', () => {
      setConsentSyncPending(true);
      render(<CookieConsentBanner />);

      // 抑止中は要素が無いので何も書かれていない
      expect(
        document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
      ).toBe('');

      act(() => {
        setConsentSyncPending(false);
      });

      expect(
        document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
      ).toBe('0px');
    });

    it('バナーが消えたら変数も外す', () => {
      const { unmount } = render(<CookieConsentBanner />);

      unmount();

      expect(
        document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR),
      ).toBe('');
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
