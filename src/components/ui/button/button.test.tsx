import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Button } from './button';

// --- Tests ---

describe('Button', () => {
  it('テキストが表示される', () => {
    render(<Button>クリック</Button>);
    expect(
      screen.getByRole('button', { name: 'クリック' }),
    ).toBeInTheDocument();
  });

  it('デフォルトのtype属性がbuttonになる', () => {
    render(<Button>テスト</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('type属性がsubmitに設定できる', () => {
    render(<Button type='submit'>送信</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('クリックイベントが発火する', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(<Button onClick={handleClick}>クリック</Button>);
    await user.click(screen.getByRole('button'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disabled状態でクリックが無効になる', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(
      <Button onClick={handleClick} disabled>
        クリック
      </Button>,
    );
    await user.click(screen.getByRole('button'));

    expect(handleClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('isLoading状態でdisabledになる', () => {
    render(<Button isLoading>クリック</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('isLoading状態でスピナーが表示される', () => {
    const { container } = render(<Button isLoading>クリック</Button>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('aria-labelが設定できる', () => {
    render(<Button aria-label='送信ボタン'>送信</Button>);
    expect(
      screen.getByRole('button', { name: '送信ボタン' }),
    ).toBeInTheDocument();
  });

  it('カスタムクラス名が適用される', () => {
    render(<Button className='custom'>テスト</Button>);
    expect(screen.getByRole('button').className).toContain('custom');
  });

  it('アクセシビリティ違反がない', async () => {
    const { container } = render(<Button>クリック</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('disabled状態でアクセシビリティ違反がない', async () => {
    const { container } = render(<Button disabled>クリック</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  /**
   * ローディング中のアクセシビリティ（#1196）
   *
   * 以前は本文を `visibility: hidden` で隠していたため、
   * **アクセシビリティツリーから外れて読み上げが「ボタン」だけ**になり、
   * さらに `disabled` 化でフォーカスが `<body>` へ落ちていた。
   */
  describe('ローディング中', () => {
    it('アクセシブルネームが消えない', () => {
      render(<Button isLoading>送信</Button>);

      expect(screen.getByRole('button', { name: '送信' })).toBeInTheDocument();
    });

    it('処理中であることを aria-busy で伝える', () => {
      render(<Button isLoading>送信</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    });

    it('ローディングでなければ aria-busy を付けない', () => {
      render(<Button>送信</Button>);

      expect(screen.getByRole('button')).not.toHaveAttribute('aria-busy');
    });

    it('アクセシビリティ違反がない', async () => {
      const { container } = render(<Button isLoading>送信</Button>);

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  /**
   * 再び押せるようになったらフォーカスを戻す（#1196）
   *
   * `disabled` になるとブラウザがフォーカスを `<body>` へ落とす。
   * キーボード利用者は、処理が終わっても Tab を打ち直すことになる。
   */
  describe('フォーカスの復帰', () => {
    it('押したボタンならローディング終了後にフォーカスが戻る', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<Button>送信</Button>);

      await user.click(screen.getByRole('button'));

      // ⚠️ jsdom は `disabled` 化によるフォーカス喪失を再現しない。しかも
      // 無効化された後では `blur()` も効かない（フォーカス不能な要素なので
      // no-op）。実ブラウザで起きる喪失を、無効化の直前に手で起こす
      screen.getByRole('button').blur();

      rerender(<Button isLoading>送信</Button>);
      expect(screen.getByRole('button')).not.toHaveFocus();

      rerender(<Button>送信</Button>);

      expect(screen.getByRole('button')).toHaveFocus();
    });

    // 触っていないボタン（一覧の「もっと見る」等）が読み込みを終えた
    // 瞬間にフォーカスを奪わない
    it('押していないボタンはフォーカスを奪わない', () => {
      const { rerender } = render(<Button isLoading>もっと見る</Button>);

      rerender(<Button>もっと見る</Button>);

      expect(screen.getByRole('button')).not.toHaveFocus();
    });

    it('他の要素がフォーカスを持っていれば奪わない', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <>
          <Button>送信</Button>
          <input aria-label='メモ' />
        </>,
      );

      await user.click(screen.getByRole('button'));
      rerender(
        <>
          <Button isLoading>送信</Button>
          <input aria-label='メモ' />
        </>,
      );

      // 待っているあいだに別の場所へ移った
      screen.getByLabelText('メモ').focus();
      rerender(
        <>
          <Button>送信</Button>
          <input aria-label='メモ' />
        </>,
      );

      expect(screen.getByLabelText('メモ')).toHaveFocus();
    });

    it('クリックのハンドラは従来どおり呼ばれる', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>送信</Button>);

      await user.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
