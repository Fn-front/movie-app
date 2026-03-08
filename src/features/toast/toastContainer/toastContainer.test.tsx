jest.mock('@/hooks/useToast');

import { render, screen } from '@testing-library/react';
import * as ToastPrimitive from '@radix-ui/react-toast';

import { ToastContainer } from './toastContainer';
import { useToast } from '@/hooks/useToast';
import type { ToastData } from '@/hooks/useToast';

// --- Helpers ---

const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;

const createMockToast = (overrides?: Partial<ToastData>): ToastData => ({
  id: '1',
  title: 'テストタイトル',
  description: 'テスト説明',
  variant: 'info',
  duration: 5000,
  ...overrides,
});

const renderWithProvider = (ui: React.ReactNode) => {
  return render(
    <ToastPrimitive.Provider>
      {ui}
      <ToastPrimitive.Viewport />
    </ToastPrimitive.Provider>,
  );
};

// --- Tests ---

describe('ToastContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('トーストがない場合は何も表示されない', () => {
    mockUseToast.mockReturnValue({
      toasts: [],
      toast: jest.fn(),
      removeToast: jest.fn(),
      clearToasts: jest.fn(),
    });
    const { container } = renderWithProvider(<ToastContainer />);
    expect(container.querySelector('[data-state="open"]')).not.toBeInTheDocument();
  });

  it('トーストが1件ある場合タイトルが表示される', () => {
    mockUseToast.mockReturnValue({
      toasts: [createMockToast()],
      toast: jest.fn(),
      removeToast: jest.fn(),
      clearToasts: jest.fn(),
    });
    renderWithProvider(<ToastContainer />);
    expect(screen.getByText('テストタイトル')).toBeInTheDocument();
  });

  it('トーストの説明が表示される', () => {
    mockUseToast.mockReturnValue({
      toasts: [createMockToast()],
      toast: jest.fn(),
      removeToast: jest.fn(),
      clearToasts: jest.fn(),
    });
    renderWithProvider(<ToastContainer />);
    expect(screen.getByText('テスト説明')).toBeInTheDocument();
  });

  it('複数のトーストが表示される', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        createMockToast({ id: '1', title: 'トースト1' }),
        createMockToast({ id: '2', title: 'トースト2' }),
      ],
      toast: jest.fn(),
      removeToast: jest.fn(),
      clearToasts: jest.fn(),
    });
    renderWithProvider(<ToastContainer />);
    expect(screen.getByText('トースト1')).toBeInTheDocument();
    expect(screen.getByText('トースト2')).toBeInTheDocument();
  });

  it('各バリアントのトーストが表示される', () => {
    mockUseToast.mockReturnValue({
      toasts: [
        createMockToast({ id: '1', title: '成功', variant: 'success' }),
        createMockToast({ id: '2', title: 'エラー', variant: 'error' }),
        createMockToast({ id: '3', title: '警告', variant: 'warning' }),
      ],
      toast: jest.fn(),
      removeToast: jest.fn(),
      clearToasts: jest.fn(),
    });
    renderWithProvider(<ToastContainer />);
    expect(screen.getByText('成功')).toBeInTheDocument();
    expect(screen.getByText('エラー')).toBeInTheDocument();
    expect(screen.getByText('警告')).toBeInTheDocument();
  });

  it('トーストを閉じるとremoveToastが呼ばれる', () => {
    const removeToast = jest.fn();
    mockUseToast.mockReturnValue({
      toasts: [createMockToast({ id: 'toast-1' })],
      toast: jest.fn(),
      removeToast,
      clearToasts: jest.fn(),
    });
    renderWithProvider(<ToastContainer />);

    const closeButton = screen.getByRole('button', { name: '閉じる' });
    closeButton.click();
    expect(removeToast).toHaveBeenCalledWith('toast-1');
  });
});
