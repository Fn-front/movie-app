/**
 * @jest-environment node
 */

/**
 * 人物API（サーバーサイド用） テスト
 */

import { PERSON_REVALIDATE_SECONDS } from '@/constants';

// --- Mocks ---

// unstable_cache はモジュール評価時に即座に呼ばれるため、
// ファクトリ内で完結させる（外の変数を参照すると TDZ で落ちる）
jest.mock('next/cache', () => ({
  unstable_cache: jest.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

import { unstable_cache } from 'next/cache';

const mockUnstableCache = unstable_cache as jest.Mock;

const mockGetPersonDetail = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getPersonDetail: (...args: unknown[]) => mockGetPersonDetail(...args),
}));

import { getCachedPersonDetail } from './person.server';

// --- Tests ---

describe('getCachedPersonDetail', () => {
  beforeEach(() => {
    mockGetPersonDetail.mockReset();
  });

  it('人物詳細のキャッシュ期間をCache-Controlと揃えている', () => {
    expect(mockUnstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['person-detail'],
      { revalidate: PERSON_REVALIDATE_SECONDS },
    );
  });

  it('TMDbの人物詳細をそのまま返す', async () => {
    const person = { id: 500, name: 'テスト俳優' };
    mockGetPersonDetail.mockResolvedValue(person);

    await expect(getCachedPersonDetail(500)).resolves.toEqual(person);
    expect(mockGetPersonDetail).toHaveBeenCalledWith(500);
  });

  it('TMDbのエラーはそのまま投げる（キャッシュに載せない）', async () => {
    mockGetPersonDetail.mockRejectedValue(new Error('TMDb error'));

    await expect(getCachedPersonDetail(500)).rejects.toThrow('TMDb error');
  });
});
