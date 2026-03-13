/**
 * ThemeProviderコンポーネントのテスト
 */

jest.mock('@/constants/common', () => ({ STORAGE_KEYS: { THEME: 'theme' } }));

import { render } from '@testing-library/react';

import { ThemeProvider } from './themeProvider';

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('localStorageにdarkテーマが保存されている場合、data-theme="dark"を設定する', () => {
    localStorage.setItem('theme', 'dark');

    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('localStorageにlightテーマが保存されている場合、data-themeをdarkに設定しない', () => {
    localStorage.setItem('theme', 'light');

    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).not.toBe(
      'dark',
    );
  });

  it('localStorageにテーマが保存されていない場合、data-themeを設定しない', () => {
    render(<ThemeProvider />);

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('nullを返す', () => {
    const { container } = render(<ThemeProvider />);

    expect(container.innerHTML).toBe('');
  });
});
