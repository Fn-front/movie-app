/**
 * 配信プロバイダーの表示ユーティリティ テスト
 */

import { toDisplayProviders } from './watchProvider';

describe('toDisplayProviders', () => {
  it('プロバイダーIDを表示用の情報に変換する', () => {
    const result = toDisplayProviders([8]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(8);
    expect(result[0].name).toBe('Netflix');
    expect(result[0].logoUrl).toBe(
      'https://image.tmdb.org/t/p/w92/rK1KljqmbvO9HQa1PBFLILWah72.png',
    );
  });

  it('WATCH_PROVIDERS に無いIDは除外する', () => {
    const result = toDisplayProviders([8, 999999]);

    expect(result.map((p) => p.id)).toEqual([8]);
  });

  it('WATCH_PROVIDERS の定義順で返す（渡された順ではない）', () => {
    // 84(U-NEXT) は定義上 8(Netflix) より後ろ
    const result = toDisplayProviders([84, 8]);

    expect(result.map((p) => p.id)).toEqual([8, 84]);
  });

  it('空配列なら空配列を返す', () => {
    expect(toDisplayProviders([])).toEqual([]);
  });

  it('同じIDが重複していても1つにまとめる', () => {
    const result = toDisplayProviders([8, 8]);

    expect(result).toHaveLength(1);
  });
});
