/**
 * zod の JIT 可否判定を抑止するブートストラップ（#1099）
 *
 * ## なぜ要るか
 *
 * zod v4 は JIT（`new Function`）が使えるかを**実際に試して**判定する。
 *
 * ```ts
 * // node_modules/zod/src/v4/core/util.ts
 * export const allowsEval = cached(() => {
 *   if (globalConfig.jitless) return false;
 *   ...
 *   try { const F = Function; new F(""); return true } catch { return false }
 * });
 * ```
 *
 * 本番の CSP に `'unsafe-eval'` は無い（`cspDirectives.mjs`。dev だけ付く）ので、
 * ブラウザでは必ず throw する。zod は catch して非JIT経路へ落ちるため**機能上の
 * 実害は無い**が、**enforce の CSP 違反が毎ロード報告される**。
 * 本番は `report-uri /api/csp-report` を付けているので、公開後はここへ流れ続ける。
 *
 * zod 自身もこの問題をソースのコメントで認識している
 * （"strict CSPs report the caught `new Function` as a `securitypolicyviolation`
 * even though the throw is swallowed"）。
 *
 * ## なぜインラインスクリプトなのか
 *
 * `z.config({ jitless: true })` を普通のモジュールに書いても**間に合わない**。
 * `allowsEval.value` が読まれるのは `z.object()` の構築時で、`src/schema/*.ts`
 * はモジュールのトップレベルでスキーマを作る。設定より先に評価される。
 *
 * zod は `globalThis.__zod_globalConfig` を**先に置いておく**経路を用意しており
 * （`core.ts` のコメント）、CJS / ESM のどちらから読まれても共有される。
 *
 * ## ⚠️ 先に走る根拠は「配置」ではなく「async の性質」
 *
 * **ドキュメント順ではチャンクのほうが先にある。** React が preload /
 * stylesheet / bootstrap script を `<head>` の先頭へ hoist するため、
 * RootLayout の `<head>` children は必ずその後ろに出る。実測（本番ビルド）:
 *
 *     movies/now-showing.html  script src が 731〜  / インラインは 2878
 *     auth/signup.html         zod チャンク 1744   / インラインは 2232
 *
 * それでも先に走るのは、**これらが全て `async` だから**。async スクリプトは
 * タスクとして実行されるので、パーサが受信済みのバイト列を同期処理している
 * 最中には割り込めない。`<head>` が1回のフラッシュで届く限り、インラインが
 * 先着する。
 *
 * ⚠️ したがって**順序はタイミング由来であって配置由来ではない**。
 * `<head>` が分割して届くほど肥大化したり、チャンクが同期読み込みに
 * 変わったりすると崩れうる。崩れたら `e2e/security/cspEval.spec.ts` が
 * 落ちる（zod のチャンク由来の違反だけを見ている）。
 *
 * ## サーバーには影響しない
 *
 * 置くのはブラウザの `globalThis` だけ。Node 側は別の realm なので、
 * サーバーの zod は JIT を使ったまま。eval が許されるサーバーで高速パスを
 * 捨てずに済む。
 *
 * ## Trusted Types について
 *
 * テーマ初期化・Consent Mode と同じく SSR で静的に埋め込むインラインスクリプトで、
 * DOM 注入 sink ではないため `require-trusted-types-for 'script'` の対象外。
 * `script-src 'unsafe-inline'` 側で許可される。
 */

/** zod が参照するグローバル設定のキー（`node_modules/zod/src/v4/core/core.ts`） */
const ZOD_GLOBAL_CONFIG_KEY = '__zod_globalConfig';

/**
 * `<head>` に埋め込むブートストラップスクリプト
 *
 * ⚠️ **zod のチャンクより先に実行されること**が前提（根拠は上の「async の性質」）。
 * 既に設定があれば壊さないよう、プロパティを足す形にする。
 */
export function buildZodJitlessScript(): string {
  const key = ZOD_GLOBAL_CONFIG_KEY;

  return (
    '(function(){try{var g=globalThis;' +
    `var c=g.${key}||(g.${key}={});` +
    'c.jitless=true}catch(e){}})()'
  );
}
