import { act, renderHook } from '@testing-library/react';

import { useTheme } from './useTheme';
import { THEME_CHANGE_EVENT } from '@/utils/theme';

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUpdateSettings = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

jest.mock('@/utils/error', () => ({
  handleApiError: () => ({ message: 'エラーが発生しました' }),
}));

describe('useTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('適用中テーマ（data-theme）を反映する', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('setTheme で data-theme・localStorage・サーバー保存・成功トーストが行われる', async () => {
    mockUpdateSettings.mockResolvedValue({});
    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.setTheme('dark');
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('movie-app:theme')).toBe('dark');
    expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('toggleTheme は現在の適用テーマを反転する', async () => {
    mockUpdateSettings.mockResolvedValue({});
    document.documentElement.setAttribute('data-theme', 'light');
    const { result } = renderHook(() => useTheme());

    await act(async () => {
      result.current.toggleTheme();
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('保存失敗時はロールバックしエラートーストを表示する', async () => {
    mockUpdateSettings.mockRejectedValue(new Error('failed'));
    // 事前に明示 light（rollback 先を確定）
    localStorage.setItem('movie-app:theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
    const { result } = renderHook(() => useTheme());

    await act(async () => {
      await result.current.setTheme('dark');
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('movie-app:theme')).toBe('light');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '更新エラー', variant: 'error' }),
    );
  });

  it('THEME_CHANGE_EVENT で resolvedTheme が同期される', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    });

    expect(result.current.resolvedTheme).toBe('dark');
  });
});
