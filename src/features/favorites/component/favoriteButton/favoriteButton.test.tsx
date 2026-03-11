import { render, screen, fireEvent } from '@testing-library/react';

import { FavoriteButton } from './favoriteButton';

describe('FavoriteButton', () => {
  describe('未登録時', () => {
    it('aria-label「お気に入りに追加」が設定される', () => {
      render(<FavoriteButton favorite={null} onClick={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: 'お気に入りに追加' }),
      ).toBeInTheDocument();
    });

    it('クリックでonClickが呼ばれる', () => {
      const onClick = jest.fn();
      render(<FavoriteButton favorite={null} onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('登録済み時', () => {
    const favorite = { id: 'fav-1', rating: 8 };

    it('aria-label「お気に入りを編集」が設定される', () => {
      render(<FavoriteButton favorite={favorite} onClick={jest.fn()} />);
      expect(
        screen.getByRole('button', { name: 'お気に入りを編集' }),
      ).toBeInTheDocument();
    });

    it('クリックでonClickが呼ばれる', () => {
      const onClick = jest.fn();
      render(<FavoriteButton favorite={favorite} onClick={onClick} />);

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
          <FavoriteButton favorite={null} onClick={onClick} />
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
          <FavoriteButton favorite={null} onClick={onClick} />
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
          <FavoriteButton favorite={null} onClick={onClick} />
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
        <FavoriteButton favorite={null} onClick={jest.fn()} disabled={true} />,
      );
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('サイズ', () => {
    it('デフォルトはsmサイズ', () => {
      const { container } = render(
        <FavoriteButton favorite={null} onClick={jest.fn()} />,
      );
      expect(
        container.querySelector('[class*="favorite_button__sm"]'),
      ).toBeInTheDocument();
    });

    it('mdサイズを指定できる', () => {
      const { container } = render(
        <FavoriteButton favorite={null} onClick={jest.fn()} size='md' />,
      );
      expect(
        container.querySelector('[class*="favorite_button__md"]'),
      ).toBeInTheDocument();
    });
  });
});
