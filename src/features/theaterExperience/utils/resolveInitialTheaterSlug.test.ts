/**
 * resolveInitialTheaterSlug テスト
 */

import { DEFAULT_THEATER_SLUG } from '@/constants';

import { resolveInitialTheaterSlug } from './resolveInitialTheaterSlug';

describe('resolveInitialTheaterSlug', () => {
  it('文字列パラメータはそのまま採用する', () => {
    expect(resolveInitialTheaterSlug('imax-gt')).toBe('imax-gt');
  });

  it('未指定（undefined）は既定劇場にフォールバックする', () => {
    expect(resolveInitialTheaterSlug(undefined)).toBe(DEFAULT_THEATER_SLUG);
  });

  it('空文字は既定劇場にフォールバックする', () => {
    expect(resolveInitialTheaterSlug('')).toBe(DEFAULT_THEATER_SLUG);
  });

  it('配列（重複指定）は不正として既定劇場にフォールバックする', () => {
    expect(resolveInitialTheaterSlug(['imax-gt', 'dolby-cinema'])).toBe(
      DEFAULT_THEATER_SLUG,
    );
  });
});
