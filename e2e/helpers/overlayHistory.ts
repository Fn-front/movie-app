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
 * オーバーレイを押す位置（上端からの距離, px）
 *
 * コンテンツは中央寄せなので、上端付近は必ずオーバーレイ。小さすぎると
 * ビューポートの縁で丸められるため少し余裕を取る
 */
const OVERLAY_CLICK_TOP = 10;

/**
 * モーダルのオーバーレイ（`modal.module.scss` の `&__overlay`）
 *
 * `position: fixed; inset: 0` で画面全体を覆い、コンテンツはその上に乗る。
 * **「ダイアログの外側」はこの要素そのもの**なので、座標を計算する必要が無い。
 */
const modalOverlay = (page: Page) =>
  page.locator('[class*="c_modal__overlay"]');

/**
 * ダイアログの外側をクリックして閉じる。
 *
 * ## 座標クリックをやめた理由（#1075）
 *
 * 以前はダイアログの矩形を測って「上端より上」を `page.mouse.click` で
 * 押していた。これは**断続的に落ちていた**（#1058 で追加 → #1066 で
 * `waitForStableBox` を足して頻度は下がったが解消せず、#1067 のシャード3で
 * 再発）。落ち方は常に「外側を押したのにダイアログが閉じていない」。
 *
 * ⛔ **`page.mouse.click` には当たり判定の検査が無い。** 指定した座標に何が
 * あろうと押すだけなので、
 *
 * - 測ったあとに中身が伸びて上端が座標より上へ来ていた
 * - トーストの viewport（`z-index: 1080`）がオーバーレイ（1050）より上に重なった
 *
 * のどちらでも、**何も起きないまま成功したことになる**。そのうえで
 * `expect(dialog).not.toBeVisible()` が落ちるので、失敗を見ても原因が分からない。
 *
 * `locator.click()` ならオーバーレイが**実際に最前面であること**を
 * Playwright が検査し、違えば「intercepts pointer events」と要素名付きで
 * 落ちる。再現しない退行を「閉じない」ではなく「何に覆われたか」で受け取れる。
 *
 * ⚠️ **実際のポインタ操作であることは変わらない**（`dispatchEvent` には
 * 逃げていない）。Radix の `onPointerDownOutside` は
 * `ownerDocument.addEventListener('pointerdown', ...)` で待っており、
 * `locator.click()` は本物の pointerdown を出す。
 *
 * ⚠️ Radix はこのリスナーを `setTimeout(..., 0)` で登録する
 * （`@radix-ui/react-dismissable-layer` の `usePointerDownOutside`）。
 * 開いた直後は外側クリックが効かない窓があるため、**可視になるのを
 * 待ってから**押すこと（下の `waitFor`）。
 *
 * ⚠️ 中央寄せ専用ではなくなった。オーバーレイを持つモーダルなら
 * ドロワーでも使える（以前は上端の余白が要り、`MIN_TOP_GAP` を
 * 下回ると例外を投げていた）。
 *
 * @param page - 対象ページ
 * @param dialog - 閉じたいダイアログ（可視になるまで待つために使う）
 */
export const clickOutsideDialog = async (page: Page, dialog: Locator) => {
  await dialog.waitFor({ state: 'visible' });

  const overlay = modalOverlay(page).last();
  await overlay.waitFor({ state: 'visible' });

  /**
   * ⚠️ 中央ではなく**上端付近**を押す。オーバーレイは画面全体を覆うので
   * 中央はコンテンツに隠れており、`locator.click()` の既定（要素の中心）だと
   * 「intercepts pointer events」で必ず落ちる。
   */
  const box = await overlay.boundingBox();

  if (!box) {
    throw new Error('オーバーレイの位置を取得できませんでした');
  }

  await overlay.click({ position: { x: box.width / 2, y: OVERLAY_CLICK_TOP } });
};
