/**
 * page_view の手動送信のテスト
 *
 * 拡張計測の履歴イベント方式を使わない理由は、このアプリが
 * router.replace でフィルタ条件を URL クエリに書いているため。
 * usePathname はクエリだけの変化では再発火しないので、手動送信なら
 * 操作のたびに計上されない。
 */

import { act, render } from '@testing-library/react';

import { AnalyticsProvider } from './analyticsProvider';

jest.mock('next/script', () => ({
  __esModule: true,
  default: () => null,
}));

/**
 * パスの変化を外部ストアとして模す
 *
 * AnalyticsProvider は memo かつ props を取らないので、`rerender` では
 * 再レンダーされない。実際の usePathname と同じくフック経由で購読させる
 * ことで、パス変化による再レンダーを再現する。
 */
const mockPathStore = {
  value: '/',
  listeners: new Set<() => void>(),
  set(next: string) {
    mockPathStore.value = next;
    mockPathStore.listeners.forEach((listener) => listener());
  },
};

jest.mock('next/navigation', () => ({
  usePathname: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSyncExternalStore } = require('react');
    return useSyncExternalStore(
      (onStoreChange: () => void) => {
        mockPathStore.listeners.add(onStoreChange);
        return () => mockPathStore.listeners.delete(onStoreChange);
      },
      () => mockPathStore.value,
      () => mockPathStore.value,
    );
  },
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

let gtagCalls: unknown[][] = [];
const pageViews = () =>
  gtagCalls.filter((args) => args[0] === 'event' && args[1] === 'page_view');

/** rAF を手動で進められるようにする */
let frameCallbacks: FrameRequestCallback[] = [];
const flushFrames = () => {
  const callbacks = frameCallbacks;
  frameCallbacks = [];
  act(() => {
    callbacks.forEach((callback) => callback(0));
  });
};

describe('AnalyticsProvider（page_view）', () => {
  beforeEach(() => {
    localStorage.clear();
    gtagCalls = [];
    frameCallbacks = [];
    delete window.dataLayer;
    window.gtag = (...args: unknown[]) => {
      gtagCalls.push(args);
    };
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
    mockPathStore.value = '/';
    mockPathStore.listeners.clear();
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  it('初回マウントでも送る（ランディングページを落とさない）', () => {
    render(<AnalyticsProvider />);
    flushFrames();

    expect(pageViews()).toHaveLength(1);
    expect(pageViews()[0][2]).toMatchObject({ page_path: '/' });
  });

  it('パスが変わったら送る', () => {
    render(<AnalyticsProvider />);
    flushFrames();

    act(() => mockPathStore.set('/movies/now-showing'));
    flushFrames();

    expect(pageViews()).toHaveLength(2);
    expect(pageViews()[1][2]).toMatchObject({
      page_path: '/movies/now-showing',
    });
  });

  it('同じパスなら送らない（クエリだけの変化を含む）', () => {
    // router.replace でフィルタ条件を URL に書いても usePathname は
    // 変化しないので、ジャンルを選ぶたびに計上されることはない
    render(<AnalyticsProvider />);
    flushFrames();

    act(() => mockPathStore.set('/'));
    flushFrames();

    expect(pageViews()).toHaveLength(1);
  });

  it('戻ってきたパスは再び送る', () => {
    render(<AnalyticsProvider />);
    flushFrames();

    act(() => mockPathStore.set('/awards'));
    flushFrames();
    act(() => mockPathStore.set('/'));
    flushFrames();

    expect(
      pageViews().map((args) => (args[2] as { page_path: string }).page_path),
    ).toEqual(['/', '/awards', '/']);
  });

  it('タイトルと URL を明示して送る', () => {
    document.title = 'テストページ | Movie App';
    render(<AnalyticsProvider />);
    flushFrames();

    expect(pageViews()[0][2]).toEqual({
      page_path: '/',
      // window.location.href ではない。クエリ文字列を落とす（#938）
      page_location: `${window.location.origin}${window.location.pathname}`,
      page_title: 'テストページ | Movie App',
    });
  });

  it('page_location にクエリ文字列を載せない', () => {
    // href をそのまま送ると /search?query=<キーワード> と
    // /auth/reset-password?token=<トークン> が Google へ渡る（#938）。
    // 同意の有無では防げないため、送信側で落とす
    render(<AnalyticsProvider />);
    flushFrames();

    const location = (pageViews()[0][2] as { page_location: string })
      .page_location;

    expect(location).not.toContain('?');
    expect(location).not.toContain('#');
  });

  it('タイトルは1フレーム待ってから読む', () => {
    // App Router のメタデータは Suspense 越しに解決されるため、effect の
    // 時点では前ページのタイトルが残っていることがある
    document.title = '前のページ';
    render(<AnalyticsProvider />);

    // まだ送っていない
    expect(pageViews()).toHaveLength(0);

    document.title = '現在のページ';
    flushFrames();

    expect(pageViews()[0][2]).toMatchObject({ page_title: '現在のページ' });
  });

  it('GA ID が無効なら送らない', () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    render(<AnalyticsProvider />);
    flushFrames();

    expect(pageViews()).toHaveLength(0);
  });
});
