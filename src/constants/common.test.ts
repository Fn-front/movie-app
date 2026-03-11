/**
 * @jest-environment node
 */

/**
 * 共通定数・メッセージヘルパー テスト
 */

import { errorMessage, successMessage } from './common';

describe('errorMessage', () => {
  it('fetchFailed: 「{target}の取得に失敗しました」を生成する', () => {
    expect(errorMessage.fetchFailed('映画データ')).toBe(
      '映画データの取得に失敗しました',
    );
  });

  it('saveFailed: 「{target}の保存に失敗しました」を生成する', () => {
    expect(errorMessage.saveFailed('設定')).toBe('設定の保存に失敗しました');
  });

  it('addFailed: 「{target}への追加に失敗しました」を生成する', () => {
    expect(errorMessage.addFailed('ウォッチリスト')).toBe(
      'ウォッチリストへの追加に失敗しました',
    );
  });

  it('removeFailed: 「{target}からの削除に失敗しました」を生成する', () => {
    expect(errorMessage.removeFailed('ウォッチリスト')).toBe(
      'ウォッチリストからの削除に失敗しました',
    );
  });

  it('updateFailed: 「{target}の更新に失敗しました」を生成する', () => {
    expect(errorMessage.updateFailed('表示名')).toBe(
      '表示名の更新に失敗しました',
    );
  });

  it('invalid: 「{target}が不正です」を生成する', () => {
    expect(errorMessage.invalid('映画ID')).toBe('映画IDが不正です');
  });

  it('notFound: 「{target}が見つかりません」を生成する', () => {
    expect(errorMessage.notFound('映画')).toBe('映画が見つかりません');
  });
});

describe('successMessage', () => {
  it('added: 「{target}に追加しました」を生成する', () => {
    expect(successMessage.added('ウォッチリスト')).toBe(
      'ウォッチリストに追加しました',
    );
  });

  it('removed: 「{target}から削除しました」を生成する', () => {
    expect(successMessage.removed('ウォッチリスト')).toBe(
      'ウォッチリストから削除しました',
    );
  });

  it('updated: 「{target}を更新しました」を生成する', () => {
    expect(successMessage.updated('映画キャッシュ')).toBe(
      '映画キャッシュを更新しました',
    );
  });
});
