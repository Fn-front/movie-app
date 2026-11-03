/**
 * gtag.js のグローバル型
 *
 * `window.gtag` は layout.tsx の <head> インラインスクリプト
 * （buildConsentBootstrapScript の出力）が定義する。NEXT_PUBLIC_GA_ID が
 * 無効なときはスクリプト自体を出力しないため、どちらも optional にして
 * 「未定義ならコマンド送出をスキップする」分岐を型で表現する。
 *
 * ⚠️ dataLayer へ直接 push しないこと。gtag.js は要素が Arguments
 * オブジェクトのときだけコマンドとして処理し、Array は無視する。
 * TypeScript で `(...args) => dataLayer.push(args)` と書くと Array を積み、
 * 「consent default は効くのに update だけ効かない」という切り分けにくい
 * 壊れ方をする。必ず window.gtag(...) を経由する。
 */

export {};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
