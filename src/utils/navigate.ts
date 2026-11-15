/**
 * 完全遷移（ハードナビゲーション）
 *
 * `window.location` を直接触る箇所をここ1つに集める。
 *
 * ⚠️ **テストから差し替えられる口を用意するため**に関数にしている。
 * jsdom の `window.location` は非 configurable・`assign` は read-only で、
 * `Object.defineProperty` も `jest.spyOn` も失敗する。このモジュールごと
 * `jest.mock` すれば止められる。
 *
 * ルーティング内の遷移には使わないこと（クライアント遷移が消える）。
 * 使いどころは、ログアウトのようにアプリの状態を捨てたい場面だけ。
 */

'use client';

/**
 * 指定URLへ完全遷移する
 *
 * @param url - 遷移先
 */
export function navigateTo(url: string): void {
  window.location.href = url;
}
