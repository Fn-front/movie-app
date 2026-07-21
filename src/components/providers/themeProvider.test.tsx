/**
 * ThemeProviderコンポーネントのテスト
 *
 * 新仕様:
 * - 明示設定（localStorage=light/dark）時は data-theme を上書きしない（初回描画は
 *   layout のインラインスクリプトが担当するため）
 * - 未設定/system 時は OS（prefers-color-scheme）を解決して適用し、OS変更に追従する
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

  it('明示 dark 設定時は data-theme を上書きしない', () => {
    localStorage.setItem('theme', 'dark');

    render(<ThemeProvider />);

    // 明示設定は Provider の対象外（インラインスクリプトが適用済みの想定）
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
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
