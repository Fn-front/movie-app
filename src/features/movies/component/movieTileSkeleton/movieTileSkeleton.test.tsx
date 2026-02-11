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
});
