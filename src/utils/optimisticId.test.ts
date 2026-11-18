/**
 * 仮IDの判定・生成テスト（#1194）
 */

import { createOptimisticId, isOptimisticId } from './optimisticId';

describe('createOptimisticId', () => {
  it('仮IDとして判定できる値を返す', () => {
    expect(isOptimisticId(createOptimisticId())).toBe(true);
  });

  // 照会キャッシュの照合キーにもなる。重複すると別の作品を差し替える
  it('連続して呼んでも衝突しない', () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => createOptimisticId()),
    );

    expect(ids.size).toBe(100);
  });
});

describe('isOptimisticId', () => {
  it('仮IDなら true', () => {
    expect(
      isOptimisticId('optimistic-11111111-2222-4333-8444-555555555555'),
    ).toBe(true);
  });

  it('サーバーが採番したUUIDなら false', () => {
    expect(isOptimisticId('11111111-2222-4333-8444-555555555555')).toBe(false);
  });

  // 前方一致で見る。途中に含まれるだけの値を仮ID扱いしない
  it('接頭辞でない位置に含まれていても false', () => {
    expect(isOptimisticId('row-optimistic-1')).toBe(false);
  });

  it('空文字なら false', () => {
    expect(isOptimisticId('')).toBe(false);
  });
});
