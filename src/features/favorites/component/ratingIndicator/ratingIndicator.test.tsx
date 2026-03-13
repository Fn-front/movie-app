import { render, screen, fireEvent } from '@testing-library/react';

import { RatingIndicator } from './ratingIndicator';

describe('RatingIndicator', () => {
  describe('表示モード', () => {
    it('1〜10の数値が表示される', () => {
      render(<RatingIndicator rating={5} />);
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByText(String(i))).toBeInTheDocument();
      }
    });

    it('role="img"が設定される', () => {
      render(<RatingIndicator rating={5} />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('aria-labelに評価値が表示される', () => {
      render(<RatingIndicator rating={7} />);
      expect(screen.getByRole('img')).toHaveAttribute(
        'aria-label',
        '評価: 7/10',
      );
    });

    it('クリックしても何も起きない', () => {
      render(<RatingIndicator rating={5} />);
      const item = screen.getByText('3');
      fireEvent.click(item);
      // エラーが発生しなければOK
    });
  });

  describe('インタラクティブモード', () => {
    it('role="radiogroup"が設定される', () => {
      render(<RatingIndicator rating={5} onRatingChange={jest.fn()} />);
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('クリックでonRatingChangeが呼ばれる', () => {
      const onRatingChange = jest.fn();
      render(<RatingIndicator rating={5} onRatingChange={onRatingChange} />);

      fireEvent.click(screen.getByRole('radio', { name: '3点' }));
      expect(onRatingChange).toHaveBeenCalledWith(3);
    });

    it('Enterキーで値が変更される', () => {
      const onRatingChange = jest.fn();
      render(<RatingIndicator rating={5} onRatingChange={onRatingChange} />);

      fireEvent.keyDown(screen.getByRole('radio', { name: '7点' }), {
        key: 'Enter',
      });
      expect(onRatingChange).toHaveBeenCalledWith(7);
    });

    it('選択中の値にaria-checked="true"が設定される', () => {
      render(<RatingIndicator rating={5} onRatingChange={jest.fn()} />);

      expect(screen.getByRole('radio', { name: '5点' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByRole('radio', { name: '4点' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });

    it('Spaceキーで値が変更される', () => {
      const onRatingChange = jest.fn();
      render(<RatingIndicator rating={5} onRatingChange={onRatingChange} />);

      fireEvent.keyDown(screen.getByRole('radio', { name: '3点' }), {
        key: ' ',
      });
      expect(onRatingChange).toHaveBeenCalledWith(3);
    });

    it('他のキーでは値が変更されない', () => {
      const onRatingChange = jest.fn();
      render(<RatingIndicator rating={5} onRatingChange={onRatingChange} />);

      fireEvent.keyDown(screen.getByRole('radio', { name: '3点' }), {
        key: 'Tab',
      });
      expect(onRatingChange).not.toHaveBeenCalled();
    });
  });

  describe('サイズ', () => {
    it('size=smの場合smクラスが適用される', () => {
      const { container } = render(<RatingIndicator rating={5} size='sm' />);
      expect(
        container.querySelector('[class*="rating_indicator__sm"]'),
      ).toBeInTheDocument();
    });
  });
});
