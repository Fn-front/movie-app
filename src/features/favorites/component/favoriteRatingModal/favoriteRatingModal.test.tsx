import { render, screen, fireEvent } from '@testing-library/react';

import { FavoriteRatingModal } from './favoriteRatingModal';

describe('FavoriteRatingModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    movieTitle: 'テスト映画',
    currentFavorite: null,
    onSubmit: jest.fn(),
    onDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('新規登録モード', () => {
    it('タイトル「お気に入りに追加」が表示される', () => {
      render(<FavoriteRatingModal {...defaultProps} />);
      expect(screen.getByText('お気に入りに追加')).toBeInTheDocument();
    });

    it('映画タイトルが表示される', () => {
      render(<FavoriteRatingModal {...defaultProps} />);
      expect(screen.getByText('テスト映画')).toBeInTheDocument();
    });

    it('「登録」ボタンが表示される', () => {
      render(<FavoriteRatingModal {...defaultProps} />);
      expect(screen.getByRole('button', { name: '登録' })).toBeInTheDocument();
    });

    it('「削除」ボタンが表示されない', () => {
      render(<FavoriteRatingModal {...defaultProps} />);
      expect(
        screen.queryByRole('button', { name: '削除' }),
      ).not.toBeInTheDocument();
    });

    it('登録ボタンクリックでonSubmitが呼ばれる', () => {
      const onSubmit = jest.fn();
      render(<FavoriteRatingModal {...defaultProps} onSubmit={onSubmit} />);

      fireEvent.click(screen.getByRole('button', { name: '登録' }));
      expect(onSubmit).toHaveBeenCalledWith(5); // デフォルト評価値
    });

    it('評価を選択して登録できる', () => {
      const onSubmit = jest.fn();
      render(<FavoriteRatingModal {...defaultProps} onSubmit={onSubmit} />);

      // 8を選択
      fireEvent.click(screen.getByRole('radio', { name: '8点' }));
      fireEvent.click(screen.getByRole('button', { name: '登録' }));
      expect(onSubmit).toHaveBeenCalledWith(8);
    });

    it('キャンセルボタンでonCloseが呼ばれる', () => {
      const onClose = jest.fn();
      render(<FavoriteRatingModal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('更新モード', () => {
    const editProps = {
      ...defaultProps,
      currentFavorite: { id: 'fav-1', rating: 7 },
    };

    it('タイトル「お気に入りを編集」が表示される', () => {
      render(<FavoriteRatingModal {...editProps} />);
      expect(screen.getByText('お気に入りを編集')).toBeInTheDocument();
    });

    it('「更新」ボタンが表示される', () => {
      render(<FavoriteRatingModal {...editProps} />);
      expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument();
    });

    it('「削除」ボタンが表示される', () => {
      render(<FavoriteRatingModal {...editProps} />);
      expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    });

    it('現在の評価が初期値として設定される', () => {
      render(<FavoriteRatingModal {...editProps} />);
      const radio = screen.getByRole('radio', { name: '7点' });
      expect(radio).toHaveAttribute('aria-checked', 'true');
    });

    it('削除ボタンクリックでonDeleteが呼ばれる', () => {
      const onDelete = jest.fn();
      render(<FavoriteRatingModal {...editProps} onDelete={onDelete} />);

      fireEvent.click(screen.getByRole('button', { name: '削除' }));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe('非表示時', () => {
    it('isOpen=falseの場合モーダルが表示されない', () => {
      render(<FavoriteRatingModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('テスト映画')).not.toBeInTheDocument();
    });
  });

  describe('handleOpenChange', () => {
    it('モーダルが閉じられるときonCloseが呼ばれる', () => {
      const onClose = jest.fn();
      render(<FavoriteRatingModal {...defaultProps} onClose={onClose} />);

      // 閉じるボタンクリックでonCloseが呼ばれる（handleOpenChange経由）
      fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('handleDelete（onDeleteなし）', () => {
    it('onDeleteがundefinedの場合に削除ハンドラーがエラーにならない', () => {
      // 新規登録モード（currentFavorite=null）ではonDeleteなしでも問題ない
      render(
        <FavoriteRatingModal
          {...defaultProps}
          currentFavorite={null}
          onDelete={undefined}
        />,
      );
      expect(
        screen.queryByRole('button', { name: '削除' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('境界値', () => {
    it('rating=1（最小値）を選択して登録できる', () => {
      const onSubmit = jest.fn();
      render(<FavoriteRatingModal {...defaultProps} onSubmit={onSubmit} />);

      fireEvent.click(screen.getByRole('radio', { name: '1点' }));
      fireEvent.click(screen.getByRole('button', { name: '登録' }));
      expect(onSubmit).toHaveBeenCalledWith(1);
    });

    it('rating=10（最大値）を選択して登録できる', () => {
      const onSubmit = jest.fn();
      render(<FavoriteRatingModal {...defaultProps} onSubmit={onSubmit} />);

      fireEvent.click(screen.getByRole('radio', { name: '10点' }));
      fireEvent.click(screen.getByRole('button', { name: '登録' }));
      expect(onSubmit).toHaveBeenCalledWith(10);
    });
  });

  describe('更新モード（submit）', () => {
    it('更新ボタンクリックで onSubmit が現在の評価で呼ばれる', () => {
      const onSubmit = jest.fn();
      render(
        <FavoriteRatingModal
          {...defaultProps}
          currentFavorite={{ id: 'fav-1', rating: 7 }}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '更新' }));
      expect(onSubmit).toHaveBeenCalledWith(7);
    });

    it('更新モードで評価を変更してから更新すると新しい評価で呼ばれる', () => {
      const onSubmit = jest.fn();
      render(
        <FavoriteRatingModal
          {...defaultProps}
          currentFavorite={{ id: 'fav-1', rating: 7 }}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.click(screen.getByRole('radio', { name: '9点' }));
      fireEvent.click(screen.getByRole('button', { name: '更新' }));
      expect(onSubmit).toHaveBeenCalledWith(9);
    });
  });

  describe('isOpen 変更時の rating リセット', () => {
    it('モーダル再オープン時に currentFavorite.rating で再初期化される', () => {
      const { rerender } = render(
        <FavoriteRatingModal
          {...defaultProps}
          currentFavorite={{ id: 'fav-1', rating: 3 }}
        />,
      );

      // 初期値: 3点
      expect(screen.getByRole('radio', { name: '3点' })).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // 別の値を選択
      fireEvent.click(screen.getByRole('radio', { name: '8点' }));
      expect(screen.getByRole('radio', { name: '8点' })).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // モーダルを閉じて再オープン → currentFavorite.rating (=3) に戻る
      rerender(
        <FavoriteRatingModal
          {...defaultProps}
          isOpen={false}
          currentFavorite={{ id: 'fav-1', rating: 3 }}
        />,
      );
      rerender(
        <FavoriteRatingModal
          {...defaultProps}
          isOpen={true}
          currentFavorite={{ id: 'fav-1', rating: 3 }}
        />,
      );

      expect(screen.getByRole('radio', { name: '3点' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('新規登録モードで再オープンすると DEFAULT_RATING=5 に戻る', () => {
      const { rerender } = render(<FavoriteRatingModal {...defaultProps} />);

      // 初期値: 5点（DEFAULT_RATING）
      expect(screen.getByRole('radio', { name: '5点' })).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // 別の値を選択
      fireEvent.click(screen.getByRole('radio', { name: '2点' }));

      // 再オープン → 5点にリセット
      rerender(<FavoriteRatingModal {...defaultProps} isOpen={false} />);
      rerender(<FavoriteRatingModal {...defaultProps} isOpen={true} />);

      expect(screen.getByRole('radio', { name: '5点' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  describe('onDeleteなし更新モード', () => {
    it('isEditModeでonDeleteがない場合は削除ボタンが表示されない', () => {
      render(
        <FavoriteRatingModal
          {...defaultProps}
          currentFavorite={{ id: 'fav-1', rating: 7 }}
          onDelete={undefined}
        />,
      );
      expect(
        screen.queryByRole('button', { name: '削除' }),
      ).not.toBeInTheDocument();
    });
  });
});
