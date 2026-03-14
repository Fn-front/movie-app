/**
 * @jest-environment node
 */

/**
 * 劇場公開中の人気映画定数 テスト
 */

import {
  NOW_SHOWING_DISPLAY_COUNT,
  NOW_SHOWING_SECTION_TITLE,
  NOW_SHOWING_SUCCESS_MESSAGES,
} from './nowShowing';

describe('劇場公開中の人気映画定数', () => {
  it('NOW_SHOWING_DISPLAY_COUNT: 表示件数が10件', () => {
    expect(NOW_SHOWING_DISPLAY_COUNT).toBe(10);
  });

  it('NOW_SHOWING_SECTION_TITLE: セクションタイトルが「劇場公開中の人気作品」', () => {
    expect(NOW_SHOWING_SECTION_TITLE).toBe('劇場公開中の人気作品');
  });

  it('NOW_SHOWING_SUCCESS_MESSAGES: 成功メッセージが正しく生成される', () => {
    expect(NOW_SHOWING_SUCCESS_MESSAGES.SYNC_COMPLETED).toBe(
      '劇場公開中の人気映画を更新しました',
    );
  });
});
