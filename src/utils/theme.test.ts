import {
  applyTheme,
  getAppliedTheme,
  getStoredPreference,
  getSystemTheme,
  isSystemMode,
  resolveTheme,
} from './theme';

/** window.matchMedia を prefers-color-scheme: dark の結果でモックする */
function mockMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? prefersDark : false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe('theme utils', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  describe('getSystemTheme', () => {
    it('OSがダーク設定なら dark を返す', () => {
      mockMatchMedia(true);
      expect(getSystemTheme()).toBe('dark');
    });

    it('OSがライト設定なら light を返す', () => {
      mockMatchMedia(false);
      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('getStoredPreference', () => {
    it('未設定なら null', () => {
      expect(getStoredPreference()).toBeNull();
    });

    it('保存値 dark を返す', () => {
      localStorage.setItem('movie-app:theme', 'dark');
      expect(getStoredPreference()).toBe('dark');
    });

    it('未知値は null に正規化する', () => {
      localStorage.setItem('movie-app:theme', 'invalid');
      expect(getStoredPreference()).toBeNull();
    });
  });

  describe('resolveTheme', () => {
    it('明示 dark/light はそのまま返す', () => {
      expect(resolveTheme('dark')).toBe('dark');
      expect(resolveTheme('light')).toBe('light');
    });

    it('system / null は OS 設定へ解決する', () => {
      mockMatchMedia(true);
      expect(resolveTheme('system')).toBe('dark');
      expect(resolveTheme(null)).toBe('dark');
    });
  });

  describe('getAppliedTheme / applyTheme', () => {
    it('applyTheme で data-theme を設定し getAppliedTheme で取得できる', () => {
      applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(getAppliedTheme()).toBe('dark');

      applyTheme('light');
      expect(getAppliedTheme()).toBe('light');
    });

    it('data-theme 未設定時は light を返す', () => {
      expect(getAppliedTheme()).toBe('light');
    });
  });

  describe('isSystemMode', () => {
    it('未設定 / system は true', () => {
      expect(isSystemMode()).toBe(true);
      localStorage.setItem('movie-app:theme', 'system');
      expect(isSystemMode()).toBe(true);
    });

    it('明示 light/dark は false', () => {
      localStorage.setItem('movie-app:theme', 'dark');
      expect(isSystemMode()).toBe(false);
    });
  });
});
