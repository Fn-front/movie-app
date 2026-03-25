/**
 * LoginPromptModal コンポーネント テスト
 */

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockLoginPromptState = {
  isOpen: false,
  message: '',
  close: jest.fn(),
};

jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: () => mockLoginPromptState,
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LoginPromptModal } from './loginPromptModal';

describe('LoginPromptModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoginPromptState.isOpen = false;
    mockLoginPromptState.message = '';
  });

  it('isOpen=falseの場合ダイアログが表示されない', () => {
    render(<LoginPromptModal />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('isOpen=trueの場合ダイアログが表示される', () => {
    mockLoginPromptState.isOpen = true;
    mockLoginPromptState.message = 'ログインが必要です。';

    render(<LoginPromptModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('ログインが必要です。')).toBeInTheDocument();
  });

  it('タイトルが表示される', () => {
    mockLoginPromptState.isOpen = true;

    render(<LoginPromptModal />);

    expect(screen.getByText('ログインが必要です')).toBeInTheDocument();
  });

  it('フッターの閉じるボタンでcloseが呼ばれる', async () => {
    const user = userEvent.setup();
    mockLoginPromptState.isOpen = true;

    render(<LoginPromptModal />);

    // Modalの×ボタンとフッターの「閉じる」ボタンが存在する
    const closeButtons = screen.getAllByRole('button', { name: '閉じる' });
    // フッターの閉じるボタン（最後の要素）をクリック
    await user.click(closeButtons[closeButtons.length - 1]);

    expect(mockLoginPromptState.close).toHaveBeenCalled();
  });

  it('ログインボタンでcloseとrouter.pushが呼ばれる', async () => {
    const user = userEvent.setup();
    mockLoginPromptState.isOpen = true;

    render(<LoginPromptModal />);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(mockLoginPromptState.close).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
  });
});
