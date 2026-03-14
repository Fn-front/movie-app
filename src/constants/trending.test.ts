/**
 * @jest-environment node
 */

/**
 * トレンド映画定数 テスト
 */

import {
  TRENDING_DISPLAY_COUNT,
  TRENDING_STALE_TIME,
  TRENDING_SECTION_TITLE,
  TRENDING_ERROR_MESSAGES,
  TRENDING_SUCCESS_MESSAGES,
} from './trending';

describe('トレンド映画定数', () => {
  it('TRENDING_DISPLAY_COUNT: 表示件数が10件', () => {
    expect(TRENDING_DISPLAY_COUNT).toBe(10);
  });

  it('TRENDING_STALE_TIME: キャッシュ有効時間が24時間（ミリ秒）', () => {
    expect(TRENDING_STALE_TIME).toBe(1000 * 60 * 60 * 24);
  });

  it('TRENDING_SECTION_TITLE: セクションタイトルが「今週のトレンド」', () => {
    expect(TRENDING_SECTION_TITLE).toBe('今週のトレンド');
  });

  it('TRENDING_ERROR_MESSAGES: エラーメッセージが正しく生成される', () => {
    expect(TRENDING_ERROR_MESSAGES.FETCH_FAILED).toBe(
      'トレンド映画の取得に失敗しました',
    );
  });

  it('TRENDING_SUCCESS_MESSAGES: 成功メッセージが正しく生成される', () => {
    expect(TRENDING_SUCCESS_MESSAGES.SYNC_COMPLETED).toBe(
      'トレンド映画を更新しました',
    );
  });
});
