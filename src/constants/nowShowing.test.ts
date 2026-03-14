/**
 * @jest-environment node
 */

/**
 * 劇場公開中の人気映画定数 テスト
 */

import {
  NOW_SHOWING_DISPLAY_COUNT,
  NOW_SHOWING_STALE_TIME,
  NOW_SHOWING_SECTION_TITLE,
  NOW_SHOWING_ERROR_MESSAGES,
  NOW_SHOWING_SUCCESS_MESSAGES,
} from './nowShowing';

describe('劇場公開中の人気映画定数', () => {
  it('NOW_SHOWING_DISPLAY_COUNT: 表示件数が10件', () => {
    expect(NOW_SHOWING_DISPLAY_COUNT).toBe(10);
  });

  it('NOW_SHOWING_STALE_TIME: キャッシュ有効時間が24時間（ミリ秒）', () => {
    expect(NOW_SHOWING_STALE_TIME).toBe(1000 * 60 * 60 * 24);
  });

  it('NOW_SHOWING_SECTION_TITLE: セクションタイトルが「劇場公開中の人気作品」', () => {
    expect(NOW_SHOWING_SECTION_TITLE).toBe('劇場公開中の人気作品');
  });

  it('NOW_SHOWING_ERROR_MESSAGES: エラーメッセージが正しく生成される', () => {
    expect(NOW_SHOWING_ERROR_MESSAGES.FETCH_FAILED).toBe(
      '劇場公開中の人気映画の取得に失敗しました',
    );
  });

  it('NOW_SHOWING_SUCCESS_MESSAGES: 成功メッセージが正しく生成される', () => {
    expect(NOW_SHOWING_SUCCESS_MESSAGES.SYNC_COMPLETED).toBe(
      '劇場公開中の人気映画を更新しました',
    );
  });
});
