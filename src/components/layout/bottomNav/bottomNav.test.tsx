/**
 * BottomNav のテスト（#1028）
 *
 * ナビの中身（何件出るか・どれが現在地か・どこへ行くか）はここで固定する。
 * 見た目の位置関係（バナーの上に積むか・本文を覆わないか）は CSS でしか
 * 決まらないため E2E（`e2e/mobile/bottomNav.spec.ts`）が担当する。
 */

import { render, screen, within } from '@testing-library/react';

import { ARIA_LABELS, ROUTES } from '@/constants';

import { BottomNav } from './bottomNav';
import {
  BOTTOM_NAV_HEIGHT_VAR,
  resolveNavHeight,
  setBottomNavHeightVar,
} from './useBottomNavHeight';

let mockPathname = '/';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

let mockStatus: 'authenticated' | 'unauthenticated' | 'loading' =
  'authenticated';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: mockStatus }),
}));

/** ボトムナビのランドマーク内のリンクを、表示順のラベルで返す */
const navLinkLabels = (): string[] =>
  within(screen.getByRole('navigation', { name: ARIA_LABELS.PRIMARY_NAV }))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('BottomNav', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockStatus = 'authenticated';
    document.documentElement.style.removeProperty(BOTTOM_NAV_HEIGHT_VAR);
  });

  describe('項目の出し分け', () => {
    it('認証済みでは5件すべて出る', () => {
      render(<BottomNav />);

      expect(navLinkLabels()).toEqual([
        'ホーム',
        '公開中',
        '検索',
        'ウォッチリスト',
        'お気に入り',
      ]);
    });

    it('未認証では保護された2件を出さず3件になる', () => {
      mockStatus = 'unauthenticated';
      render(<BottomNav />);

      // 押しても LoginPromptModal が出るだけの導線を5枠に常設しない
      expect(navLinkLabels()).toEqual(['ホーム', '公開中', '検索']);
      expect(
        screen.queryByRole('link', { name: 'ウォッチリスト' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'お気に入り' }),
      ).not.toBeInTheDocument();
    });

    it('セッション判定中は未認証と同じ3件を出す', () => {
      // 先に5件出して減らすと「押そうとした導線が消える」ほうの揺れになる。
      // 増える側に倒すのが #1028 で承認済みのトレードオフ
      mockStatus = 'loading';
      render(<BottomNav />);

      expect(navLinkLabels()).toEqual(['ホーム', '公開中', '検索']);
    });
  });

  describe('現在地', () => {
    it('現在のページのリンクに aria-current="page" が付く', () => {
      mockPathname = ROUTES.WATCHLIST;
      render(<BottomNav />);

      expect(
        screen.getByRole('link', { name: 'ウォッチリスト' }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('現在のページ以外には aria-current が付かない', () => {
      mockPathname = ROUTES.WATCHLIST;
      render(<BottomNav />);

      for (const label of ['ホーム', '公開中', '検索', 'お気に入り']) {
        expect(screen.getByRole('link', { name: label })).not.toHaveAttribute(
          'aria-current',
        );
      }
    });

    it('ナビの外のパスではどのリンクにも aria-current が付かない', () => {
      mockPathname = ROUTES.AWARDS;
      render(<BottomNav />);

      const links = within(
        screen.getByRole('navigation', { name: ARIA_LABELS.PRIMARY_NAV }),
      ).getAllByRole('link');

      for (const link of links) {
        expect(link).not.toHaveAttribute('aria-current');
      }
    });

    it('現在地をアクセシブル名で二重に伝えない（#1046）', () => {
      mockPathname = ROUTES.HOME;
      render(<BottomNav />);

      // 「ホーム（現在のページ）」のような aria-label を足すと、
      // aria-current と合わせて二重に読み上げられる
      expect(screen.getByRole('link', { name: 'ホーム' })).not.toHaveAttribute(
        'aria-label',
      );
    });
  });

  describe('遷移先', () => {
    it('各リンクの href が ROUTES と一致する', () => {
      render(<BottomNav />);

      const expected: [string, string][] = [
        ['ホーム', ROUTES.HOME],
        ['公開中', ROUTES.NOW_SHOWING],
        ['検索', ROUTES.SEARCH],
        ['ウォッチリスト', ROUTES.WATCHLIST],
        ['お気に入り', ROUTES.FAVORITES],
      ];

      for (const [label, href] of expected) {
        expect(screen.getByRole('link', { name: label })).toHaveAttribute(
          'href',
          href,
        );
      }
    });
  });
});

/**
 * 高さの CSS 変数
 *
 * jest.setup.js の ResizeObserver は no-op スタブでコールバックが発火しない。
 * コンポーネント経由では検証できないため、純関数として固定する
 * （同意バナーの `bannerHeight.test.ts` と同じ理由）。
 */
describe('setBottomNavHeightVar', () => {
  beforeEach(() => {
    document.documentElement.style.removeProperty(BOTTOM_NAV_HEIGHT_VAR);
  });

  it('px 付きで書き込む', () => {
    // 単位を落とすと calc(0px + 0) が無効になり、トーストの bottom が効かない
    setBottomNavHeightVar(56);

    expect(
      document.documentElement.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR),
    ).toBe('56px');
  });

  it('小数は切り上げる', () => {
    setBottomNavHeightVar(56.2);

    expect(
      document.documentElement.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR),
    ).toBe('57px');
  });

  it('lg 以上で display: none になったときの 0 を書ける', () => {
    setBottomNavHeightVar(56);
    setBottomNavHeightVar(0);

    expect(
      document.documentElement.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR),
    ).toBe('0px');
  });

  it('null で変数を外す', () => {
    setBottomNavHeightVar(56);
    setBottomNavHeightVar(null);

    expect(
      document.documentElement.style.getPropertyValue(BOTTOM_NAV_HEIGHT_VAR),
    ).toBe('');
  });

  it('同値なら書き込まない（ResizeObserver のループを避ける）', () => {
    setBottomNavHeightVar(56);
    const setProperty = jest.spyOn(
      document.documentElement.style,
      'setProperty',
    );

    setBottomNavHeightVar(56);

    expect(setProperty).not.toHaveBeenCalled();
    setProperty.mockRestore();
  });
});

describe('resolveNavHeight', () => {
  /**
   * ResizeObserver の entry を模す
   *
   * 実ブラウザでは borderBoxSize / contentRect の両方が設定される。
   * どちらを読んでいるかを区別するため意図的に値をずらす
   */
  const createEntry = (
    borderBoxBlockSize: number | undefined,
    contentHeight: number,
    boundingHeight = contentHeight,
  ) =>
    ({
      borderBoxSize:
        borderBoxBlockSize === undefined
          ? undefined
          : [{ blockSize: borderBoxBlockSize, inlineSize: 0 }],
      contentRect: { height: contentHeight } as DOMRectReadOnly,
      target: {
        getBoundingClientRect: () => ({ height: boundingHeight }) as DOMRect,
      } as Element,
    }) as unknown as ResizeObserverEntry;

  it('境界ボックスの高さを返す（border-top ぶんを含む）', () => {
    // 内容ボックスで測るとフッター最下 1px に境界線が重なる（#966）
    const entry = createEntry(57, 56);

    expect(resolveNavHeight(entry)).toBe(57);
  });

  it('内容ボックスの高さは使わない', () => {
    // 差を大きく取り、肯定形で固定する。`not.toBe(50)` だと
    // 「内容ボックス + 1px」という実装も通ってしまう
    const entry = createEntry(100, 50);

    expect(resolveNavHeight(entry)).toBe(100);
  });

  it('borderBoxSize が無い環境では境界ボックスの実測へフォールバックする', () => {
    const entry = createEntry(undefined, 56, 57);

    expect(resolveNavHeight(entry)).toBe(57);
  });
});
