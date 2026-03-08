import { render, screen } from '@testing-library/react';

import { Toast, ToastProvider } from './toast';

// --- Tests ---

const renderToast = (props: Partial<React.ComponentProps<typeof Toast>> = {}) =>
  render(
    <ToastProvider>
      <Toast
        open={true}
        onOpenChange={jest.fn()}
        title='通知'
        description='テスト通知です'
        {...props}
      />
    </ToastProvider>,
  );

describe('Toast', () => {
  it('タイトルと説明が表示される', () => {
    renderToast();
    expect(screen.getByText('通知')).toBeInTheDocument();
    expect(screen.getByText('テスト通知です')).toBeInTheDocument();
  });

  it('open=falseの時にトーストが非表示になる', () => {
    renderToast({ open: false });
    expect(screen.queryByText('通知')).not.toBeInTheDocument();
  });

  it('閉じるボタンが表示される', () => {
    renderToast();
    expect(screen.getByRole('button', { name: '閉じる' })).toBeInTheDocument();
  });

  it('アクション要素が表示される', () => {
    renderToast({ action: <button>取り消す</button> });
    expect(
      screen.getByRole('button', { name: '取り消す' }),
    ).toBeInTheDocument();
  });
});

describe('ToastProvider', () => {
  it('子要素がレンダリングされる', () => {
    render(
      <ToastProvider>
        <p>テスト内容</p>
      </ToastProvider>,
    );
    expect(screen.getByText('テスト内容')).toBeInTheDocument();
  });
});
