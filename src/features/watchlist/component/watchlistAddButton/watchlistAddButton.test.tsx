import { render, screen, fireEvent } from '@testing-library/react';

import { WatchlistAddButton } from './watchlistAddButton';

describe('WatchlistAddButton', () => {
  describe('未追加時', () => {
    it('aria-label「ウォッチリストに追加」が設定される', () => {
      render(<WatchlistAddButton isInWatchlist={false} onClick={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      ).toBeInTheDocument();
    });

    it('クリックでonClickが呼ばれる', () => {
      const onClick = jest.fn();
      render(<WatchlistAddButton isInWatchlist={false} onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('追加済み時', () => {
    it('aria-label「ウォッチリストから削除」が設定される', () => {
      render(<WatchlistAddButton isInWatchlist={true} onClick={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: 'ウォッチリストから削除' }),
      ).toBeInTheDocument();
    });

    it('クリックでonClickが呼ばれる', () => {
      const onClick = jest.fn();
      render(<WatchlistAddButton isInWatchlist={true} onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('event.stopPropagation', () => {
    it('クリック時にstopPropagationが呼ばれる', () => {
      const onClick = jest.fn();
      const parentClick = jest.fn();

      render(
        <div onClick={parentClick}>
          <WatchlistAddButton isInWatchlist={false} onClick={onClick} />
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
          <WatchlistAddButton isInWatchlist={false} onClick={onClick} />
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
          <WatchlistAddButton isInWatchlist={false} onClick={onClick} />
        </div>,
      );

      fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(parentKeyDown).not.toHaveBeenCalled();
    });
  });

  describe('disabled状態', () => {
    it('disabledの場合ボタンが無効になる', () => {
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          disabled={true}
        />,
      );
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('サイズ', () => {
    it('デフォルトはsmサイズ', () => {
      const { container } = render(
        <WatchlistAddButton isInWatchlist={false} onClick={jest.fn()} />,
      );
      expect(
        container.querySelector('[class*="watchlist_add_button__sm"]'),
      ).toBeInTheDocument();
    });

    it('mdサイズを指定できる', () => {
      const { container } = render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          size='md'
        />,
      );
      expect(
        container.querySelector('[class*="watchlist_add_button__md"]'),
      ).toBeInTheDocument();
    });
  });
});
