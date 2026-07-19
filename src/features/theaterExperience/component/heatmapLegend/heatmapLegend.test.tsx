/**
 * HeatmapLegend コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { HeatmapLegend } from './heatmapLegend';

describe('HeatmapLegend', () => {
  it('凡例グループがラベル付きで表示される', () => {
    render(<HeatmapLegend />);

    expect(
      screen.getByRole('group', { name: '音響ヒートマップの凡例' }),
    ).toBeInTheDocument();
  });

  it('タイトル（相対音圧）を表示する', () => {
    render(<HeatmapLegend />);

    expect(screen.getByText('相対音圧（正規化）')).toBeInTheDocument();
  });

  it('色に依存せず読める数値スケール（0%/50%/100%）を表示する', () => {
    render(<HeatmapLegend />);

    expect(screen.getByText('弱 0%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('強 100%')).toBeInTheDocument();
  });
});
