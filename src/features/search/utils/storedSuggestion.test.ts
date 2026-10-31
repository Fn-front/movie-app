/**
 * 原題提案の引き継ぎ（sessionStorage）のテスト
 */

import { TITLE_SUGGESTION } from '@/constants';

import {
  clearStoredSuggestion,
  readSuggestionForQuery,
  writeStoredSuggestion,
} from './storedSuggestion';

const KEY = TITLE_SUGGESTION.STORAGE_KEY;

describe('storedSuggestion', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  describe('writeStoredSuggestion', () => {
    it('遷移先のクエリと候補を対応付けて保存する', () => {
      writeStoredSuggestion({
        query: 'Gojira',
        suggestions: ['Gojira', 'Godzilla'],
      });

      expect(JSON.parse(sessionStorage.getItem(KEY) as string)).toEqual({
        query: 'Gojira',
        suggestions: ['Gojira', 'Godzilla'],
      });
    });

    it('sessionStorageが使えなくても例外を投げない', () => {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(() =>
        writeStoredSuggestion({ query: 'Gojira', suggestions: ['Gojira'] }),
      ).not.toThrow();
    });
  });

  describe('readSuggestionForQuery', () => {
    it('保存が無い場合は空で、取り除く必要もない', () => {
      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: [],
        isStale: false,
      });
    });

    it('保存されたクエリと一致する場合は候補を引き継ぐ', () => {
      writeStoredSuggestion({
        query: 'Gojira',
        suggestions: ['Gojira', 'Godzilla'],
      });

      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: ['Gojira', 'Godzilla'],
        isStale: false,
      });
    });

    it('保存されたクエリと一致しない場合は引き継がず、取り除く対象になる', () => {
      writeStoredSuggestion({ query: 'Gojira', suggestions: ['Gojira'] });

      expect(readSuggestionForQuery('別のキーワード')).toEqual({
        suggestions: [],
        isStale: true,
      });
    });

    it('クエリ無し（ジャンル・年のみの検索）でも引き継がない', () => {
      writeStoredSuggestion({ query: 'Gojira', suggestions: ['Gojira'] });

      expect(readSuggestionForQuery('')).toEqual({
        suggestions: [],
        isStale: true,
      });
    });

    it('旧形式（裸の配列）は不正値として取り除く対象になる', () => {
      sessionStorage.setItem(KEY, JSON.stringify(['Gojira', 'Godzilla']));

      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: [],
        isStale: true,
      });
    });

    it('JSONとして壊れた値は不正値として取り除く対象になる', () => {
      sessionStorage.setItem(KEY, '{壊れたJSON');

      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: [],
        isStale: true,
      });
    });

    it('suggestionsが文字列配列でない値は不正値として扱う', () => {
      sessionStorage.setItem(
        KEY,
        JSON.stringify({ query: 'Gojira', suggestions: [1, 2] }),
      );

      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: [],
        isStale: true,
      });
    });

    it('queryを持たないオブジェクトは不正値として扱う', () => {
      sessionStorage.setItem(KEY, JSON.stringify({ suggestions: ['Gojira'] }));

      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: [],
        isStale: true,
      });
    });

    it('sessionStorageが使えない場合は例外を投げず、取り除こうともしない', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(readSuggestionForQuery('Gojira')).toEqual({
        suggestions: [],
        isStale: false,
      });
    });
  });

  describe('clearStoredSuggestion', () => {
    it('保存値を取り除く', () => {
      writeStoredSuggestion({ query: 'Gojira', suggestions: ['Gojira'] });

      clearStoredSuggestion();

      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('sessionStorageが使えなくても例外を投げない', () => {
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(() => clearStoredSuggestion()).not.toThrow();
    });
  });
});
