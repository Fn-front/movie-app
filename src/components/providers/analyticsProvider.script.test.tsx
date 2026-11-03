/**
 * gtag.js の読み込みのテスト
 *
 * next/script はこのリポジトリで使用実績が無い。afterInteractive は
 * useEffect 内で document.body.appendChild するため、jsdom では
 * インラインスクリプトが実際に実行されてしまう。必ずモックする。
 */

import { render, screen } from '@testing-library/react';

import { AnalyticsProvider } from './analyticsProvider';

jest.mock('next/script', () => ({
  __esModule: true,
  default: ({
    id,
    src,
    children,
    dangerouslySetInnerHTML,
  }: {
    id?: string;
    src?: string;
    children?: string;
    dangerouslySetInnerHTML?: { __html?: string };
  }) => (
    <div data-testid='next-script' data-id={id} data-src={src}>
      {dangerouslySetInnerHTML?.__html ?? children}
    </div>
  ),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('@/lib/api/user/user', () => ({
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

describe('AnalyticsProvider（gtag.js の読み込み）', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.dataLayer;
    delete window.gtag;
    process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  it('loader と初期化の2本を描画する', () => {
    render(<AnalyticsProvider />);

    const scripts = screen.getAllByTestId('next-script');
    expect(scripts).toHaveLength(2);
  });

  it('両方に id を付ける（無いと再マウントで二重注入される）', () => {
    render(<AnalyticsProvider />);

    const ids = screen
      .getAllByTestId('next-script')
      .map((element) => element.getAttribute('data-id'));

    expect(ids).toEqual(['ga-loader', 'ga-init']);
  });

  it('測定IDを含む URL から読み込む', () => {
    render(<AnalyticsProvider />);

    expect(screen.getAllByTestId('next-script')[0]).toHaveAttribute(
      'data-src',
      `https://www.googletagmanager.com/gtag/js?id=${VALID_GA_ID}`,
    );
  });

  it('自動 page_view を切る', () => {
    render(<AnalyticsProvider />);

    expect(screen.getAllByTestId('next-script')[1]).toHaveTextContent(
      'send_page_view:false',
    );
  });

  it('dataLayer と gtag を再定義しない（consent default を消さない）', () => {
    render(<AnalyticsProvider />);

    const init = screen.getAllByTestId('next-script')[1].textContent ?? '';
    expect(init).not.toContain('window.dataLayer=');
    expect(init).not.toContain('window.gtag=');
  });

  it('GA ID が未設定なら何も描画しない', () => {
    delete process.env.NEXT_PUBLIC_GA_ID;

    render(<AnalyticsProvider />);

    expect(screen.queryByTestId('next-script')).not.toBeInTheDocument();
  });

  it('GA ID が不正な形式なら何も描画しない', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_GA_ID = 'invalid';

    render(<AnalyticsProvider />);

    expect(screen.queryByTestId('next-script')).not.toBeInTheDocument();
  });
});
