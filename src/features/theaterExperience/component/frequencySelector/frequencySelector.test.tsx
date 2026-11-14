/**
 * FrequencySelector コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FrequencyBand } from '../../types';

import { FrequencySelector } from './frequencySelector';

describe('FrequencySelector', () => {
  const defaultProps = {
    value: 'mid' as FrequencyBand,
    onValueChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('3つの周波数帯ボタンが表示される', () => {
    render(<FrequencySelector {...defaultProps} />);

    expect(screen.getByRole('radio', { name: /低音/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /中音/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /高音/ })).toBeInTheDocument();
  });

  it('現在の値が選択状態になる', () => {
    render(<FrequencySelector {...defaultProps} value='low' />);

    const lowButton = screen.getByRole('radio', { name: /低音/ });
    expect(lowButton).toHaveAttribute('data-state', 'on');
  });

  it('別の周波数をクリックするとonValueChangeが呼ばれる', async () => {
    const user = userEvent.setup();
    const onValueChange = jest.fn();

    render(
      <FrequencySelector {...defaultProps} onValueChange={onValueChange} />,
    );

    await user.click(screen.getByRole('radio', { name: /高音/ }));

    expect(onValueChange).toHaveBeenCalledWith('high');
  });

  it('ラベルが表示される', () => {
    render(<FrequencySelector {...defaultProps} />);

    expect(screen.getByText('周波数帯')).toBeInTheDocument();
  });

  it('group のaria-labelledbyが設定されている', () => {
    render(<FrequencySelector {...defaultProps} />);

    const group = screen.getByRole('group', { name: '周波数帯' });
    expect(group).toHaveAttribute('aria-labelledby', 'frequency-label');
  });

  /**
   * WCAG 2.5.3 Label in Name の回帰（#1106）
   *
   * `aria-label='低音（80 Hz）'` が付いていたとき、axe の
   * `label-content-name-mismatch` は**括弧内を除去**してから単語列を
   * 比較するため、名前が `["低音"]` になり可視テキスト
   * `["低音","80","hz"]` を含まなかった。
   *
   * ⚠️ 実測の結果は **violation ではなく incomplete（要確認）**。
   * axe 4.14 の `valueTextRoles` に `radio` が含まれており、一致しなかった
   * radio は判定が保留されるため。ただし共通ヘルパー
   * `expectNoA11yViolations` は incomplete でも落とす。
   *
   * ⚠️ **「違反が無いこと」は単体テストでは固定できない**（axe を
   * 動かさないため）。`aria-label` が戻ったことを属性で検出し、
   * 名前が可視テキストから作られていることを名前で固定する。
   * axe 側の検査は `e2e/a11y/labelInName.spec.ts` が受け持つ。
   */
  describe('Label in Name（WCAG 2.5.3）', () => {
    it.each([
      ['低音', '80 Hz'],
      ['中音', '1 kHz'],
      ['高音', '8 kHz'],
    ])('%s は aria-label を持たず、名前に %s を含む', (label, frequency) => {
      render(<FrequencySelector {...defaultProps} />);

      const item = screen.getByRole('radio', { name: new RegExp(label) });

      // 可視テキストを名前に含めない aria-label が戻ったら落ちる
      expect(item).not.toHaveAttribute('aria-label');
      expect(item).not.toHaveAttribute('aria-labelledby');

      // 見えている文字がすべて名前に入っている（音声入力で読み上げて操作できる）
      expect(item).toHaveAccessibleName(new RegExp(label));
      expect(item).toHaveAccessibleName(new RegExp(frequency));
    });
  });
});
