/**
 * selectTrailerVideos のテスト
 */

import type { Video } from '@/lib/types';

import {
  TRAILER_DISPLAY_LIMIT,
  selectTrailerVideos,
} from './selectTrailerVideos';

/**
 * テスト用の Video を組み立てる
 */
function createVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'id-1',
    iso_639_1: 'en',
    iso_3166_1: 'US',
    key: 'key-1',
    name: 'video',
    site: 'YouTube',
    size: 1080,
    type: 'Trailer',
    official: true,
    published_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('selectTrailerVideos', () => {
  it('動画が未取得（undefined）の場合は空配列を返す', () => {
    expect(selectTrailerVideos(undefined)).toEqual([]);
  });

  it('動画が0件の場合は空配列を返す', () => {
    expect(selectTrailerVideos([])).toEqual([]);
  });

  it('YouTube以外の配信サイトの動画を除外する', () => {
    const videos = [
      createVideo({ id: 'vimeo', site: 'Vimeo' }),
      createVideo({ id: 'youtube', site: 'YouTube' }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual(['youtube']);
  });

  it('Trailer・Teaser以外の種別を除外する', () => {
    const videos = [
      createVideo({ id: 'featurette', type: 'Featurette' }),
      createVideo({ id: 'clip', type: 'Clip' }),
      createVideo({ id: 'bts', type: 'Behind the Scenes' }),
      createVideo({ id: 'teaser', type: 'Teaser' }),
      createVideo({ id: 'trailer', type: 'Trailer' }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'trailer',
      'teaser',
    ]);
  });

  it('予告編が1件も無い場合は空配列を返す', () => {
    const videos = [
      createVideo({ id: 'featurette', type: 'Featurette' }),
      createVideo({ id: 'clip', type: 'Clip' }),
    ];

    expect(selectTrailerVideos(videos)).toEqual([]);
  });

  it('日本語の動画を他言語より優先する', () => {
    const videos = [
      createVideo({ id: 'en-trailer', iso_639_1: 'en', type: 'Trailer' }),
      createVideo({ id: 'ja-teaser', iso_639_1: 'ja', type: 'Teaser' }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'ja-teaser',
      'en-trailer',
    ]);
  });

  it('同じ言語ならTrailerをTeaserより優先する', () => {
    const videos = [
      createVideo({ id: 'teaser', iso_639_1: 'ja', type: 'Teaser' }),
      createVideo({ id: 'trailer', iso_639_1: 'ja', type: 'Trailer' }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'trailer',
      'teaser',
    ]);
  });

  it('手話版の予告編は同じ種別の通常版より後ろに回す', () => {
    const videos = [
      createVideo({
        id: 'asl',
        name: 'Official American Sign Language Trailer',
        published_at: '2026-06-01T00:00:00.000Z',
      }),
      createVideo({
        id: 'normal',
        name: 'Official Trailer',
        published_at: '2026-01-01T00:00:00.000Z',
      }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'normal',
      'asl',
    ]);
  });

  it('英国手話（BSL）の予告編も後ろに回す', () => {
    const videos = [
      createVideo({
        id: 'bsl',
        name: 'Official BSL Trailer',
        published_at: '2026-06-01T00:00:00.000Z',
      }),
      createVideo({
        id: 'normal',
        name: 'Official Trailer',
        published_at: '2026-01-01T00:00:00.000Z',
      }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'normal',
      'bsl',
    ]);
  });

  it('手話版の判定は大文字小文字を区別しない', () => {
    const videos = [
      createVideo({
        id: 'asl',
        name: 'official american sign language trailer',
        published_at: '2026-06-01T00:00:00.000Z',
      }),
      createVideo({
        id: 'normal',
        name: 'Official Trailer',
        published_at: '2026-01-01T00:00:00.000Z',
      }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'normal',
      'asl',
    ]);
  });

  it('手話版しか無い場合でも除外せず表示する', () => {
    const videos = [createVideo({ id: 'asl', name: 'Official ASL Trailer' })];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual(['asl']);
  });

  it('日本語の手話版は他言語の通常版より優先する', () => {
    const videos = [
      createVideo({
        id: 'en-normal',
        iso_639_1: 'en',
        name: 'Official Trailer',
      }),
      createVideo({
        id: 'ja-asl',
        iso_639_1: 'ja',
        name: '日本手話版 予告編 Sign Language',
      }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'ja-asl',
      'en-normal',
    ]);
  });

  it('言語・種別が同じなら公開日の新しい順に並べる', () => {
    const videos = [
      createVideo({ id: 'old', published_at: '2026-01-01T00:00:00.000Z' }),
      createVideo({ id: 'new', published_at: '2026-06-01T00:00:00.000Z' }),
      createVideo({ id: 'middle', published_at: '2026-03-01T00:00:00.000Z' }),
    ];

    expect(selectTrailerVideos(videos).map((v) => v.id)).toEqual([
      'new',
      'middle',
      'old',
    ]);
  });

  it('上限件数を超える場合は優先度の高い順に切り詰める', () => {
    const videos = Array.from({ length: TRAILER_DISPLAY_LIMIT + 3 }, (_, i) =>
      createVideo({
        id: `video-${i}`,
        type: 'Teaser',
        published_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    videos.push(createVideo({ id: 'ja-trailer', iso_639_1: 'ja' }));

    const result = selectTrailerVideos(videos);

    expect(result).toHaveLength(TRAILER_DISPLAY_LIMIT);
    expect(result[0].id).toBe('ja-trailer');
  });

  it('元の配列を破壊しない', () => {
    const videos = [
      createVideo({ id: 'en', iso_639_1: 'en' }),
      createVideo({ id: 'ja', iso_639_1: 'ja' }),
    ];

    selectTrailerVideos(videos);

    expect(videos.map((v) => v.id)).toEqual(['en', 'ja']);
  });
});
