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
 * ダイアログの寸法が落ち着くまで待ってから位置を返す。
 *
 * 中身を非同期に足すダイアログ（フィルターのジャンル一覧など）は、開いた直後は
 * まだ伸びている。中央寄せなので**伸びると上端が上へ動く**ため、先に測った
 * 「上端より上」の座標が、押す頃にはコンテンツの内側になっている。
 * そこを押すとダイアログの中を押すことになり、当然閉じない。
 *
 * もともと潜在していたレースで、`/movies/now-showing` のフィルターが
 * ジャンル取得を待つあいだに開くため表面化しやすい。ボトムナビ（#1028）が
 * 各ページで3〜5本の RSC プリフェッチを足したことで取得が後ろへずれ、
 * **毎回負けるようになった**（実測: 5回中5回失敗 → この待機で 5/5 成功）。
 *
 * 連続2回**同じ**矩形を読めたら落ち着いたとみなす。`expect.poll` の間隔は
 * 100ms 以上空くので、開くアニメーション（200ms）も自然に待てる
 */
const waitForStableBox = async (dialog: Locator) => {
  let previousKey = '';

  await expect
    .poll(
      async () => {
        const box = await dialog.boundingBox();
        if (box === null) {
          previousKey = '';
          return false;
        }

        const key = [box.x, box.y, box.width, box.height]
          .map((value) => Math.round(value))
          .join(',');
        const isStable = key === previousKey;
        previousKey = key;
        return isStable;
      },
      { message: 'ダイアログの寸法が落ち着きませんでした' },
    )
    .toBe(true);

  return dialog.boundingBox();
};

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
  // 伸びている途中を測ると、押す頃には上端が座標より上へ来ている
  const box = await waitForStableBox(dialog);

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
