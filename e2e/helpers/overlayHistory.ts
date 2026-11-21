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
 * 押す点をコンテンツの縁からどれだけ離すか（px）
 *
 * ぴったり境界を狙うと、小数の矩形がデバイスピクセルへ丸められたときに
 * 内側へ落ちる。余白のある辺を選んだうえで、その余白の中央を押す。
 */
const EDGE_MARGIN = 4;

/**
 * クリックの上限（ms）
 *
 * 覆われていたときに `intercepts pointer events` の call log 付きで
 * 落とすための上限。既定（無制限）だと素のテストタイムアウトになる。
 */
const OVERLAY_CLICK_TIMEOUT_MS = 10_000;

/**
 * ダイアログの外側をクリックして閉じる。
 *
 * ## 何が壊れていたか（#1075 で特定済み）
 *
 * 以前はダイアログの矩形を測って「上端より上」を `page.mouse.click` で
 * 押していた。フィルターモーダルはジャンル取得後に伸び、中央寄せなので
 * **伸びると上端が上へ動く**。測った時点の座標は、押す頃にはコンテンツの
 * 内側に入っている。
 *
 * Issue に CI の trace（`Page.mouseClick {"x":187.5,"y":64.75}` ＝
 * ジャンル無しの上端 129.5 から計算）と、フルサイズ（上端 40.6px）の
 * 失敗スクショの突き合わせがある。決定論的な再現手順も記録されている。
 *
 * ⛔ **`page.mouse.click` には当たり判定の検査が無い。** 指定座標に何が
 * あろうと押すだけなので、内側を押しても**何も起きないまま成功したことに
 * なる**。そのあと `expect(dialog).not.toBeVisible()` が落ちるので、
 * 第一報は「閉じていない」だけになる。
 *
 * `locator.click()` ならオーバーレイが実際に最前面であることを Playwright が
 * 検査し、違えば「intercepts pointer events」と要素名付きで落ちる。
 *
 * ⚠️ **実際のポインタ操作であることは変わらない**（`dispatchEvent` には
 * 逃げていない）。Radix の `onPointerDownOutside` は
 * `ownerDocument.addEventListener('pointerdown', ...)` で待っており、
 * `locator.click()` は本物の pointerdown を出す。
 *
 * ## 仮説のうち外れたもの（Issue で検証済み）
 *
 * - **Radix がマウント直後の pointerdown を無視する**: 外れ。リスナー登録は
 *   `setTimeout(..., 0)` だが **0ms** で、テストは100ms以上待つ
 * - **トーストが座標を奪う**: 外れ。`elementFromPoint` は常にオーバーレイを
 *   返す。トーストの viewport は `bottom` 基準で画面上部に届かず、
 *   Radix がモーダル表示中に body の `pointer-events` を切る
 *
 * ## 他のモーダルでも使える形
 *
 * ⛔ 「上端を押す」は汎用の安全点ではない。ドロワー
 * （`mobileDrawer.module.scss`）は左上を占めるし、`size='lg'` のモーダルは
 * 左右の余白が 1.4px しかない。**オーバーレイの矩形からコンテンツの矩形を
 * 除いて、余白のある辺を選ぶ**。
 *
 * オーバーレイは Radix の Portal 内でコンテンツの**直前の兄弟**
 * （`Dialog.Overlay` → `Dialog.Content`）。`modal.tsx` も
 * `mobileDrawer.tsx` も同じ形なので、クラス名に依存せず辿れる。
 *
 * @param page - 対象ページ（互換のため受けるが位置の計算には使わない）
 * @param dialog - 閉じたいダイアログ
 */
export const clickOutsideDialog = async (page: Page, dialog: Locator) => {
  await dialog.waitFor({ state: 'visible' });

  // Radix の Portal では Overlay が Content の直前の兄弟
  const overlay = dialog.locator('xpath=preceding-sibling::*[1]');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });

  const [overlayBox, dialogBox] = await Promise.all([
    overlay.boundingBox(),
    dialog.boundingBox(),
  ]);

  if (!overlayBox || !dialogBox) {
    throw new Error(
      'オーバーレイまたはダイアログの位置を取得できませんでした。' +
        'Radix の Portal 構造（Overlay が Content の直前の兄弟）が変わった可能性があります',
    );
  }

  const point = outsidePoint(overlayBox, dialogBox);

  if (!point) {
    throw new Error(
      'オーバーレイに押せる余白がありません' +
        `（overlay=${describeBox(overlayBox)} / dialog=${describeBox(dialogBox)}）。` +
        '全面を覆うコンテンツには clickOutsideDialog を使えません',
    );
  }

  /**
   * ⚠️ **上限を入れる。** 既定の `actionTimeout` は 0（無制限）なので、
   * 覆われていると**素のテストタイムアウト**になり、せっかくの
   * 「何に覆われたか」が出ない（旧 `waitForStableBox` と同じ失敗の形）。
   */
  await overlay.click({ position: point, timeout: OVERLAY_CLICK_TIMEOUT_MS });
};

/** 失敗メッセージ用 */
const describeBox = (box: Box) =>
  `{x:${Math.round(box.x)},y:${Math.round(box.y)},w:${Math.round(box.width)},h:${Math.round(box.height)}}`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * オーバーレイの中で、コンテンツに覆われていない点を返す（overlay 相対）
 *
 * 上・下・左・右の順に、`EDGE_MARGIN * 2` 以上の余白がある辺を探して
 * その中央を返す。どこにも無ければ `null`。
 */
const outsidePoint = (
  overlay: Box,
  dialog: Box,
): { x: number; y: number } | null => {
  const gaps = [
    // 上
    {
      size: dialog.y - overlay.y,
      point: {
        x: dialog.x + dialog.width / 2 - overlay.x,
        y: (dialog.y - overlay.y) / 2,
      },
    },
    // 下
    {
      size: overlay.y + overlay.height - (dialog.y + dialog.height),
      point: {
        x: dialog.x + dialog.width / 2 - overlay.x,
        y:
          dialog.y +
          dialog.height -
          overlay.y +
          (overlay.y + overlay.height - (dialog.y + dialog.height)) / 2,
      },
    },
    // 左
    {
      size: dialog.x - overlay.x,
      point: {
        x: (dialog.x - overlay.x) / 2,
        y: dialog.y + dialog.height / 2 - overlay.y,
      },
    },
    // 右
    {
      size: overlay.x + overlay.width - (dialog.x + dialog.width),
      point: {
        x:
          dialog.x +
          dialog.width -
          overlay.x +
          (overlay.x + overlay.width - (dialog.x + dialog.width)) / 2,
        y: dialog.y + dialog.height / 2 - overlay.y,
      },
    },
  ];

  const usable = gaps.find((gap) => gap.size >= EDGE_MARGIN * 2);

  return usable ? usable.point : null;
};
