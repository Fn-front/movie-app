/**
 * トースト表示で AnalyticsProvider が再レンダリングされないことのテスト（#939）
 *
 * ⚠️ このファイルは `@/hooks/useToast` を**モックしない**。
 * 他の analyticsProvider テストはモックしているが、それでは
 * 「一覧を購読していないこと」を検証できない。
 *
 * レンダリング回数は `getGaMeasurementId` の呼び出し回数で数える。
 * これは AnalyticsProvider のレンダリング本体で毎回呼ばれる
 * （`analyticsProvider.tsx` の `const measurementId = getGaMeasurementId()`）。
 */

import { act, render, renderHook } from '@testing-library/react';

import { useToastDispatch } from '@/hooks/useToast';
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

jest.mock('@/lib/api/user/user', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

// getGaMeasurementId だけを数える。他は実物のまま使う
jest.mock('@/utils/analytics', () => {
  const actual = jest.requireActual('@/utils/analytics');
  return {
    ...actual,
    getGaMeasurementId: jest.fn(() => actual.getGaMeasurementId()),
  };
});

import { getGaMeasurementId } from '@/utils/analytics';

const mockGetGaMeasurementId = getGaMeasurementId as jest.MockedFunction<
  typeof getGaMeasurementId
>;

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

describe('AnalyticsProvider（トーストによる再レンダリング）', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetGaMeasurementId.mockClear();
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
    window.gtag = () => {};
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

  it('トーストを出しても再レンダリングされない', () => {
    render(<AnalyticsProvider />);

    const { result } = renderHook(() => useToastDispatch());
    const rendersBeforeToast = mockGetGaMeasurementId.mock.calls.length;

    act(() => {
      result.current.toast({ title: '保存しました', variant: 'success' });
    });

    expect(mockGetGaMeasurementId.mock.calls.length).toBe(rendersBeforeToast);
  });

  it('トーストを削除しても再レンダリングされない', () => {
    render(<AnalyticsProvider />);

    const { result } = renderHook(() => useToastDispatch());
    act(() => {
      result.current.toast({ title: '保存しました' });
    });

    const rendersBeforeRemove = mockGetGaMeasurementId.mock.calls.length;

    act(() => {
      result.current.clearToasts();
    });

    expect(mockGetGaMeasurementId.mock.calls.length).toBe(rendersBeforeRemove);
  });

  // 上の2件が「購読していないから増えない」ことを示すには、
  // そもそも計測が機能している（レンダリングされれば増える）ことが要る
  it('対比: 再レンダリングされれば計測値は増える', () => {
    const { rerender } = render(<AnalyticsProvider />);

    const before = mockGetGaMeasurementId.mock.calls.length;
    // memo を貫通させるため key を変えて新しくマウントする
    rerender(<AnalyticsProvider key='second' />);

    expect(mockGetGaMeasurementId.mock.calls.length).toBeGreaterThan(before);
  });
});
