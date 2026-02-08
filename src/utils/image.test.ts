import {
  getTMDbImageUrl,
  getTMDbPosterUrl,
  getTMDbBackdropUrl,
  getPlaceholderImageUrl,
} from './image';

describe('getTMDbImageUrl', () => {
  it('pathからURLを生成する', () => {
    expect(getTMDbImageUrl('/abc123.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/abc123.jpg',
    );
  });

  it('nullの場合nullを返す', () => {
    expect(getTMDbImageUrl(null)).toBeNull();
  });

  it('undefinedの場合nullを返す', () => {
    expect(getTMDbImageUrl(undefined)).toBeNull();
  });

  it('サイズ指定が反映される', () => {
    expect(getTMDbImageUrl('/abc123.jpg', 'w780')).toBe(
      'https://image.tmdb.org/t/p/w780/abc123.jpg',
    );
  });

  it('デフォルトサイズがw500である', () => {
    expect(getTMDbImageUrl('/abc123.jpg')).toContain('/w500/');
  });
});

describe('getTMDbPosterUrl', () => {
  it('pathからw500のURLを返す', () => {
    expect(getTMDbPosterUrl('/poster.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/poster.jpg',
    );
  });

  it('nullの場合nullを返す', () => {
    expect(getTMDbPosterUrl(null)).toBeNull();
  });
});

describe('getTMDbBackdropUrl', () => {
  it('pathからoriginalのURLを返す', () => {
    expect(getTMDbBackdropUrl('/backdrop.jpg')).toBe(
      'https://image.tmdb.org/t/p/original/backdrop.jpg',
    );
  });

  it('nullの場合nullを返す', () => {
    expect(getTMDbBackdropUrl(null)).toBeNull();
  });
});

describe('getPlaceholderImageUrl', () => {
  it('width,heightからURLを生成する', () => {
    const url = getPlaceholderImageUrl(300, 450);
    expect(url).toBe('https://placehold.co/300x450?text=300x450');
  });

  it('text指定がURLに含まれる', () => {
    const url = getPlaceholderImageUrl(300, 450, 'No Image');
    expect(url).toContain('text=No%20Image');
  });
});
