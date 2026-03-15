import { render, screen, fireEvent } from '@testing-library/react';

import { DismissButton } from './dismissButton';

describe('DismissButton', () => {
  it('aria-label「興味なし」が設定される', () => {
    render(<DismissButton onClick={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: '興味なし' }),
    ).toBeInTheDocument();
  });

  it('クリックでonClickが呼ばれる', () => {
    const onClick = jest.fn();
    render(<DismissButton onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('event.stopPropagation', () => {
    it('クリック時にstopPropagationが呼ばれる', () => {
      const onClick = jest.fn();
      const parentClick = jest.fn();

      render(
        <div onClick={parentClick}>
          <DismissButton onClick={onClick} />
        </div>,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(parentClick).not.toHaveBeenCalled();
    });

    it('Enterキー時にstopPropagationが呼ばれる', () => {
      const onClick = jest.fn();
      const parentKeyDown = jest.fn();

      render(
        <div onKeyDown={parentKeyDown}>
          <DismissButton onClick={onClick} />
        </div>,
      );

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(parentKeyDown).not.toHaveBeenCalled();
    });

    it('Spaceキー時にstopPropagationが呼ばれる', () => {
      const onClick = jest.fn();
      const parentKeyDown = jest.fn();

      render(
        <div onKeyDown={parentKeyDown}>
          <DismissButton onClick={onClick} />
        </div>,
      );

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(parentKeyDown).not.toHaveBeenCalled();
    });

    it('その他のキーではonClickが呼ばれない', () => {
      const onClick = jest.fn();
      render(<DismissButton onClick={onClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('disabled状態', () => {
    it('disabledの場合ボタンが無効になる', () => {
      render(<DismissButton onClick={jest.fn()} disabled={true} />);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('サイズ', () => {
    it('デフォルトはsmサイズ', () => {
      const { container } = render(<DismissButton onClick={jest.fn()} />);
      expect(
        container.querySelector('[class*="dismiss_button__sm"]'),
      ).toBeInTheDocument();
    });

    it('mdサイズを指定できる', () => {
      const { container } = render(
        <DismissButton onClick={jest.fn()} size='md' />,
      );
      expect(
        container.querySelector('[class*="dismiss_button__md"]'),
      ).toBeInTheDocument();
    });
  });
});
