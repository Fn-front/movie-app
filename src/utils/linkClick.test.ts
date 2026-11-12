import { shouldLetBrowserHandle } from './linkClick';

/**
 * `React.MouseEvent` のうち判定に使う分だけを作る
 *
 * 実際のイベントを作らずに真理値表そのものを固定する。stretched link を
 * 使う画面（MovieTile / WatchlistTile / FavoriteTile / WatchlistItem）が
 * すべてこの関数に乗っているため、ここが崩れると
 * **⌘+クリックで新しいタブに開く導線が全画面で黙って死ぬ**
 */
const clickEvent = (
  overrides: Partial<React.MouseEvent> = {},
): React.MouseEvent =>
  ({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  }) as React.MouseEvent;

describe('shouldLetBrowserHandle', () => {
  it('修飾キーなしの左クリックは横取りする', () => {
    expect(shouldLetBrowserHandle(clickEvent())).toBe(false);
  });

  it.each([
    ['⌘（新しいタブ / macOS）', { metaKey: true }],
    ['Ctrl（新しいタブ / Windows）', { ctrlKey: true }],
    ['Shift（新しいウィンドウ）', { shiftKey: true }],
    ['Alt（ダウンロード）', { altKey: true }],
  ])('%s 付きのクリックはブラウザに任せる', (_name, modifier) => {
    expect(shouldLetBrowserHandle(clickEvent(modifier))).toBe(true);
  });

  it.each([
    ['中クリック', 1],
    ['右クリック', 2],
  ])('%s はブラウザに任せる', (_name, button) => {
    expect(shouldLetBrowserHandle(clickEvent({ button }))).toBe(true);
  });

  // 他のハンドラーが既に止めたイベントを横取りすると、止めた側の意図を壊す
  it('既に preventDefault されたイベントには触らない', () => {
    expect(shouldLetBrowserHandle(clickEvent({ defaultPrevented: true }))).toBe(
      true,
    );
  });
});
