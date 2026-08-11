import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MobileMenuButton } from './mobileMenuButton';

describe('MobileMenuButton', () => {
  const defaultProps = {
    isOpen: false,
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ハンバーガーメニューボタンが表示される', () => {
    render(<MobileMenuButton {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: 'メニューを開く' }),
    ).toBeInTheDocument();
  });

  it('閉じた状態では「メニューを開く」ラベルが設定される', () => {
    render(<MobileMenuButton {...defaultProps} isOpen={false} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'メニューを開く');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('開いた状態では「メニューを閉じる」ラベルが設定される', () => {
    render(<MobileMenuButton {...defaultProps} isOpen={true} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'メニューを閉じる');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('クリックでonToggleが呼ばれる', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(<MobileMenuButton {...defaultProps} onToggle={onToggle} />);
    await user.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('カスタムクラス名が適用される', () => {
    render(<MobileMenuButton {...defaultProps} className='custom-class' />);
    expect(screen.getByRole('button').className).toContain('custom-class');
  });

  it('境界値: Enter キーでも onToggle が呼ばれる（キーボード操作）', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(<MobileMenuButton {...defaultProps} onToggle={onToggle} />);

    const button = screen.getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('境界値: Space キーでも onToggle が呼ばれる（キーボード操作）', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(<MobileMenuButton {...defaultProps} onToggle={onToggle} />);

    const button = screen.getByRole('button');
    button.focus();
    await user.keyboard(' ');

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
