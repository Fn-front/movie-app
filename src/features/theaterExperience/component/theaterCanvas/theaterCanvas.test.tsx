/**
 * TheaterCanvas コンポーネント テスト
 * R3F Canvas内の描画はテスト対象外。props受渡し・DOM構造のみ検証。
 */

import { render, screen } from '@testing-library/react';

// R3F/Three.js モック
jest.mock('@react-three/fiber', () => ({
  Canvas: jest.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid='r3f-canvas'>{children}</div>
  )),
}));

import { TheaterCanvas } from './theaterCanvas';

describe('TheaterCanvas', () => {
  it('aria-hidden=trueのラッパーがレンダリングされる', () => {
    render(
      <TheaterCanvas>
        <mesh />
      </TheaterCanvas>,
    );

    const wrapper = screen.getByTestId('r3f-canvas').parentElement;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('childrenがCanvas内にレンダリングされる', () => {
    render(
      <TheaterCanvas>
        <div data-testid='child-content'>test</div>
      </TheaterCanvas>,
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});
