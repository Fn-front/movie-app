import { render, screen, fireEvent } from '@testing-library/react';

import { FavoriteButton } from './favoriteButton';
import styles from './favoriteButton.module.scss';

describe('FavoriteButton', () => {
  /**
   * 登録状況が分かるまでは見せない（#1135）
   *
   * `favorite` が null でも「未登録」とは限らない（照会がまだ終わって
   * いないだけのことがある）。空のハートを出すと、確定後に一斉に
   * 塗りつぶされて「誤った状態を見せてから直す」ことになる
   */
  describe('登録状況が未確定のとき', () => {
    it('ハートを見せない', () => {
      render(
        <FavoriteButton favorite={null} onClick={jest.fn()} isResolving />,
      );

      // jsdom は SCSS を評価しないのでクラスで確認する
      expect(screen.getByRole('button')).toHaveClass(
        styles['c_favorite_button--resolving'],
      );
    });

    it('確定したら見せる', () => {
      render(<FavoriteButton favorite={null} onClick={jest.fn()} />);

      expect(screen.getByRole('button')).not.toHaveClass(
        styles['c_favorite_button--resolving'],
      );
    });
  });

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

    it('その他のキーではonClickが呼ばれない', () => {
      const onClick = jest.fn();
      render(<FavoriteButton favorite={null} onClick={onClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
      expect(onClick).not.toHaveBeenCalled();
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
