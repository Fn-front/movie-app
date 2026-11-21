import { render, screen, fireEvent } from '@testing-library/react';

import { WatchlistAddButton } from './watchlistAddButton';
import styles from './watchlistAddButton.module.scss';

describe('WatchlistAddButton', () => {
  /**
   * 登録状況が分かるまでは見せない（#1145）
   *
   * `isInWatchlist` が false でも「未登録」とは限らない（照会がまだ
   * 終わっていないだけのことがある）。輪郭のしおりを出すと、登録済みの作品でも
   * 追加できるように見え、押すと成功トーストの直後に 409 のエラートーストが
   * 重なる
   */
  describe('登録状況が未確定のとき', () => {
    it('ボタンを見せない', () => {
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          isResolving
        />,
      );

      // jsdom は SCSS を評価しないのでクラスで確認する
      expect(screen.getByRole('button')).toHaveClass(
        styles['c_watchlist_add_button--resolving'],
      );
    });

    it('確定したら見せる', () => {
      render(<WatchlistAddButton isInWatchlist={false} onClick={jest.fn()} />);

      expect(screen.getByRole('button')).not.toHaveClass(
        styles['c_watchlist_add_button--resolving'],
      );
    });
  });

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

    it('その他のキーではonClickが呼ばれない', () => {
      const onClick = jest.fn();
      render(<WatchlistAddButton isInWatchlist={false} onClick={onClick} />);

      fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
      expect(onClick).not.toHaveBeenCalled();
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
  /**
   * 一覧では作品名を含める（#1047）
   *
   * ⛔ 一覧には同じ名前のボタンが最大20個並ぶ。スクリーンリーダーの
   * 要素リスト（NVDA `Insert + F7` / VoiceOver のローター）のように
   * **文脈から切り離して読むモード**では、どの作品への操作か分からない。
   */
  describe('作品名入りのアクセシブルネーム（#1047）', () => {
    it('movieTitle を渡すと未登録のラベルに作品名が入る', () => {
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          movieTitle='テスト映画'
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'テスト映画をウォッチリストに追加',
        }),
      ).toBeInTheDocument();
    });

    it('movieTitle を渡すと登録済みのラベルにも作品名が入る', () => {
      render(
        <WatchlistAddButton
          isInWatchlist
          onClick={jest.fn()}
          movieTitle='テスト映画'
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'テスト映画をウォッチリストから削除',
        }),
      ).toBeInTheDocument();
    });

    /** ⚠️ 詳細モーダルは1作品しか無いので冗長にしない */
    it('movieTitle を渡さなければ従来どおりの文言', () => {
      render(<WatchlistAddButton isInWatchlist={false} onClick={jest.fn()} />);

      expect(
        screen.getByRole('button', { name: 'ウォッチリストに追加' }),
      ).toBeInTheDocument();
    });
  });

  /**
   * 可視ラベル（#1030）
   *
   * お気に入りと並ぶとどちらも「保存」に見えて区別できないため、幅に余裕の
   * あるリスト行でだけ言葉にする。
   */
  describe('可視ラベル（#1030）', () => {
    it('既定ではラベルを出さない', () => {
      render(<WatchlistAddButton isInWatchlist={false} onClick={jest.fn()} />);

      expect(screen.queryByText('ウォッチリスト')).not.toBeInTheDocument();
    });

    it('showLabel を渡すとラベルを出す', () => {
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          showLabel
        />,
      );

      expect(screen.getByText('ウォッチリスト')).toBeInTheDocument();
    });

    it('登録済みでもラベルは変えない', () => {
      render(
        <WatchlistAddButton isInWatchlist onClick={jest.fn()} showLabel />,
      );

      // 状態は塗りつぶしたしおりが伝える。ラベルまで入れ替えると幅が
      // 行ごとに変わり、一覧を縦に走査できなくなる
      expect(screen.getByText('ウォッチリスト')).toBeInTheDocument();
    });

    /**
     * ⛔ **可視ラベルをアクセシブルネームにしない。**
     *
     * `aria-label` が無くなると読み上げが「ウォッチリスト」だけになり、
     * 一覧に同じ名前のボタンが最大20個並んでどの作品か分からなくなる
     * （#1047 が解いた問題がそのまま戻る）。
     */
    it('ラベルを出してもアクセシブルネームは aria-label のまま', () => {
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          movieTitle='テスト映画'
          showLabel
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'テスト映画をウォッチリストに追加',
        }),
      ).toBeInTheDocument();
    });

    it('showLabel のときラベル付きのクラスが付く', () => {
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={jest.fn()}
          showLabel
        />,
      );

      // jsdom は SCSS を評価しないのでクラスで確認する
      expect(screen.getByRole('button')).toHaveClass(
        styles['c_watchlist_add_button--with_label'],
      );
    });

    it('ラベルを出してもクリックできる', () => {
      const onClick = jest.fn();
      render(
        <WatchlistAddButton
          isInWatchlist={false}
          onClick={onClick}
          showLabel
        />,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
