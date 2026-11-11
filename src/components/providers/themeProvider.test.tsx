/**
 * ThemeProviderコンポーネントのテスト
 *
 * 仕様:
 * - マウント時、明示設定の有無によらず解決済みテーマを適用する
 * - 未設定/system 時は OS（prefers-color-scheme）を解決して適用し、OS変更に追従する
 *
 * 以前は「明示設定時は layout のインラインスクリプトが適用済み」という前提で
 * 上書きしない作りだった。しかし `notFound()` のページはインラインスクリプトを
 * 含まない最小シェルで返るため、明示設定のユーザーに一度も適用されなかった（#1013）。
 */

jest.mock('@/constants/common', () => ({ STORAGE_KEYS: { THEME: 'theme' } }));

import { act, render } from '@testing-library/react';

import { ThemeProvider } from './themeProvider';

const mediaState = { dark: false };
const listeners: Array<() => void> = [];

function setupMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes('dark') ? mediaState.dark : false;
      },
      media: query,
      addEventListener: (_event: string, cb: () => void) => {
        listeners.push(cb);
      },
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    mediaState.dark = false;
    listeners.length = 0;
    setupMatchMedia();
  });

  it('明示 dark 設定かつ OS ライトなら data-theme=dark を適用する', () => {
    // notFound() のページではインラインスクリプトが流れてこないため、
    // ここで適用しないと明示設定が一度も反映されない（#1013）
    localStorage.setItem('theme', 'dark');
    mediaState.dark = false;

    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('明示 light 設定かつ OS ダークなら data-theme=light を適用する', () => {
    localStorage.setItem('theme', 'light');
    mediaState.dark = true;

    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('明示設定時は OS 変更に追従しない', () => {
    localStorage.setItem('theme', 'dark');
    mediaState.dark = false;
    render(<ThemeProvider />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => {
      mediaState.dark = true;
      listeners.forEach((listener) => listener());
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('未設定かつ OS ダーク時は data-theme=dark を適用する', () => {
    mediaState.dark = true;

    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('未設定かつ OS ライト時は data-theme=light を適用する', () => {
    mediaState.dark = false;

    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('system 設定時に OS 変更へ追従して data-theme を更新する', () => {
    render(<ThemeProvider />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    // OS がダークへ切り替わったことを通知
    act(() => {
      mediaState.dark = true;
      listeners.forEach((listener) => listener());
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('nullを返す', () => {
    const { container } = render(<ThemeProvider />);

    expect(container.innerHTML).toBe('');
  });
});
