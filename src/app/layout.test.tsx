/**
 * ルートレイアウトの配線のテスト
 *
 * `<head>` のブートストラップは「GA ID が有効なときだけ出す」「ストレージキーを
 * 定数から補間する」という性質を持つが、その配線は layout.tsx にしか無い。
 * スクリプト本文そのものの挙動は analytics.test.ts が担保する。
 *
 * `renderToStaticMarkup` を使うのは、`<html><head>` を返すコンポーネントを
 * RTL の `render()` に通すと DOM の入れ子として扱われて壊れるため。
 */

import { renderToStaticMarkup } from 'react-dom/server';

import { STORAGE_KEYS } from '@/constants';
import RootLayout from './layout';

// プロバイダは実体を描画すると useSession や Radix の useLayoutEffect を
// 踏むので、素通しに差し替える
jest.mock('@/components/providers/sessionProvider', () => ({
  AppSessionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/components/providers/queryProvider', () => ({
  AppQueryProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/components/providers/toastProvider', () => ({
  AppToastProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('@/components/providers/themeProvider', () => ({
  ThemeProvider: () => null,
}));
jest.mock('@/components/providers/analyticsProvider', () => ({
  AnalyticsProvider: () => <div data-testid='analytics-provider' />,
}));
jest.mock(
  '@/features/cookieConsent/component/cookieConsentBanner/cookieConsentBanner',
  () => ({
    CookieConsentBanner: () => <div data-testid='cookie-banner' />,
  }),
);

const VALID_GA_ID = 'G-PSW1MY7HB4';
const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const renderLayout = (modal: React.ReactNode = null) =>
  renderToStaticMarkup(<RootLayout modal={modal}>本文</RootLayout>);

describe('RootLayout', () => {
  afterEach(() => {
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  describe('consent default のブートストラップ', () => {
    it('GA ID が有効なら出力する', () => {
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout();

      expect(html).toContain("gtag('consent','default'");
    });

    it('GA ID が未設定なら出力しない', () => {
      delete process.env.NEXT_PUBLIC_GA_ID;

      const html = renderLayout();

      expect(html).not.toContain("gtag('consent','default'");
    });

    it('GA ID が不正な形式なら出力しない', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_GA_ID = 'invalid';

      const html = renderLayout();

      expect(html).not.toContain("gtag('consent','default'");
    });

    it('ストレージキーを定数から補間する（べた書きの同期漏れを防ぐ）', () => {
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout();

      expect(html).toContain(STORAGE_KEYS.COOKIE_CONSENT);
      expect(html).toContain(STORAGE_KEYS.COOKIE_CONSENT_VERSION);
    });

    it('gtag.js の読み込みより前に置く', () => {
      // Consent Mode は default が先に dataLayer へ積まれていることが前提
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout();

      expect(html.indexOf("gtag('consent','default'")).toBeLessThan(
        html.indexOf('analytics-provider'),
      );
    });

    it('テーマ初期化スクリプトと共存する', () => {
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout();

      expect(html).toContain(STORAGE_KEYS.THEME);
      expect(html).toContain("gtag('consent','default'");
    });
  });

  describe('配線', () => {
    it('GA ID の有無によらずプロバイダとバナーを描画する', () => {
      // GA ID 無効時でも撤回トグルや Cookie 削除のために常にマウントする
      delete process.env.NEXT_PUBLIC_GA_ID;

      const html = renderLayout();

      expect(html).toContain('analytics-provider');
      expect(html).toContain('cookie-banner');
    });

    it('バナーを本文より後ろに置く（スキップリンクの前提を崩さない）', () => {
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout();

      expect(html.indexOf('本文')).toBeLessThan(html.indexOf('cookie-banner'));
    });

    // intercepting route の映画詳細モーダルが入るスロット（#1033）。
    // 受け取り忘れるとモーダルが一切描画されないが、ビルドは通ってしまう
    it('@modal スロットを本文と並べて描画する', () => {
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout(<div data-testid='modal-slot' />);

      expect(html).toContain('modal-slot');
      expect(html.indexOf('本文')).toBeLessThan(html.indexOf('modal-slot'));
    });

    it('@modal スロットが空でも本文を描画する', () => {
      process.env.NEXT_PUBLIC_GA_ID = VALID_GA_ID;

      const html = renderLayout();

      expect(html).toContain('本文');
    });
  });
});
