import { render } from '@testing-library/react';

import { MovieTileSkeleton } from './movieTileSkeleton';

describe('MovieTileSkeleton', () => {
  it('デフォルトで20個のスケルトンカードが表示される', () => {
    const { container } = render(<MovieTileSkeleton />);
    const cards = container.querySelectorAll('.c_movie_tile_skeleton');
    expect(cards).toHaveLength(20);
  });

  it('countを指定した場合その数だけ表示される', () => {
    const { container } = render(<MovieTileSkeleton count={5} />);
    const cards = container.querySelectorAll('.c_movie_tile_skeleton');
    expect(cards).toHaveLength(5);
  });

  it('count=0の場合スケルトンが表示されない', () => {
    const { container } = render(<MovieTileSkeleton count={0} />);
    const cards = container.querySelectorAll('.c_movie_tile_skeleton');
    expect(cards).toHaveLength(0);
  });

  it('各カードにポスターとテキストスケルトンが含まれる', () => {
    const { container } = render(<MovieTileSkeleton count={1} />);
    expect(
      container.querySelector('.c_movie_tile_skeleton__poster'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('.c_movie_tile_skeleton__info'),
    ).toBeInTheDocument();
  });

  // リスト表示（#1014）。グリッド用の縦長のまま出すと、1件で画面が
  // 埋まってしまい読み込み後のレイアウトと大きくずれる
  describe('表示モード', () => {
    it('既定ではリスト用のクラスが付かない', () => {
      const { container } = render(<MovieTileSkeleton count={1} />);
      expect(
        container.querySelector('.c_movie_tile_skeleton--list'),
      ).not.toBeInTheDocument();
    });

    it('viewMode="list" でリスト用のクラスが付く', () => {
      const { container } = render(
        <MovieTileSkeleton count={1} viewMode='list' />,
      );
      expect(
        container.querySelector('.c_movie_tile_skeleton--list'),
      ).toBeInTheDocument();
    });
  });
});
