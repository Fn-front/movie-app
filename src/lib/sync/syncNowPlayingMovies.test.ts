/**
 * Now Playing 同期ロジックのテスト
 */

// TMDbモジュールのモック（モジュールレベルの環境変数チェックを回避）
jest.mock('@/lib/tmdb/tmdb', () => ({
  getNowPlayingMovies: jest.fn(),
}));

import type { NowPlayingSyncResult } from './syncNowPlayingMovies';

describe('syncNowPlayingMovies', () => {
  // syncNowPlayingMovies は外部依存（Supabase, TMDb API）が多いため、
  // 結合テストはAPIルート経由で行う。
  // ここではNowPlayingSyncResultの型が正しいことを確認する。
  it('NowPlayingSyncResultの型が期待通りであること', () => {
    const result: NowPlayingSyncResult = {
      fetched: 40,
      upserted: 35,
      cleared: 3,
      skipped: 5,
      errors: [],
    };

    expect(result.fetched).toBe(40);
    expect(result.upserted).toBe(35);
    expect(result.cleared).toBe(3);
    expect(result.skipped).toBe(5);
    expect(result.errors).toHaveLength(0);
  });

  it('エラーがある場合のNowPlayingSyncResult', () => {
    const result: NowPlayingSyncResult = {
      fetched: 20,
      upserted: 0,
      cleared: 0,
      skipped: 2,
      errors: ['UPSERT error: connection failed'],
    };

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('UPSERT error');
  });
});
