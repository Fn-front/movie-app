/**
 * オーバーレイが積んだ履歴エントリを見るためのヘルパー（#1026 / #1041 / #1043）
 *
 * `useOverlayHistory` は開いているあいだ、所有者トークンを
 * `history.state.__overlayHistory` に持つエントリを1つ積む。閉じたときに
 * 畳まれないと**戻っても何も起きない「空振り」**になるが、残ったエントリは
 * 開いた時点と同じ URL なので、URL だけ見ていても見つからない。
 */

import { expect, type Locator, type Page } from '@playwright/test';

/** `useOverlayHistory` が使う history.state のキー（`src/hooks/useOverlayHistory.ts`） */
const OVERLAY_STATE_KEY = '__overlayHistory';

/** いま積まれているオーバーレイの所有者トークン（無ければ null） */
const overlayToken = (page: Page) =>
  page.evaluate(
    (key) => (window.history.state?.[key] as string | undefined) ?? null,
    OVERLAY_STATE_KEY,
  );

/**
 * 積んだエントリが畳み終わるまで待つ。
 *
 * 畳む処理は非同期なので、閉じた直後に `goBack()` すると2回ぶん戻ってしまう。
 * テスト側のレースであって実装の問題ではない（利用者がそこまで速く押すことはない）
 */
export const waitForFold = (page: Page) =>
  expect.poll(() => overlayToken(page)).toBeNull();

/**
 * オーバーレイのエントリが実在することを確かめる。
 *
 * `waitForFold` は「トークンが消えるまで待つ」ので、**最初から無ければ
 * 即座に解決して何も待たない**。閉じる前にここで実在を固定しないと、
 * エントリが積まれていない不具合を素通りさせる
 */
export const expectEntryExists = (page: Page) =>
  expect.poll(() => overlayToken(page)).not.toBeNull();

/**
 * 中央寄せのダイアログで、上端より上は必ずオーバーレイと言える最小の余白（px）。
 *
 * これを下回るものは中央寄せではない（画面上端から始まるドロワー等）ので、
 * 座標クリックの前提が崩れる
 */
const MIN_TOP_GAP = 8;

/**
 * ダイアログの外側をクリックして閉じる。
 *
 * コンテンツは中央寄せ（`modal.module.scss` の `top/left: 50%` + translate）なので、
 * **上端より上は必ずオーバーレイ**。`locator.click()` ではコンテンツに
 * 覆われた位置を押しに行くことがあるため、座標で指定する。
 *
 * ⚠️ 中央寄せでないオーバーレイには使えない。ドロワー
 * （`mobileDrawer.module.scss` の `top: 0; left: 0; bottom: 0`）は上端が 0 なので、
 * 上半分を押すとドロワーの中身を押してしまう。**clamp して無理に押さず**、
 * 前提が崩れていることを失敗として出す
 */
export const clickOutsideDialog = async (page: Page, dialog: Locator) => {
  const box = await dialog.boundingBox();

  if (!box) {
    throw new Error('ダイアログの位置を取得できませんでした');
  }

  if (box.y < MIN_TOP_GAP) {
    throw new Error(
      `上端の余白が ${box.y}px しかありません。中央寄せでないオーバーレイには clickOutsideDialog を使えません`,
    );
  }

  await page.mouse.click(box.x + box.width / 2, box.y / 2);
};
