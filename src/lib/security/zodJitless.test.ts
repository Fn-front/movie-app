/**
 * zodJitless テスト
 *
 * ⚠️ **CSP 違反が実際に消えるかはここでは見られない。** CSP はブラウザが
 * 適用するもので、`'unsafe-eval'` が付かないのは本番ビルドだけ。
 * そちらは `e2e/security/cspEval.spec.ts` が見る。
 *
 * ここで固定するのは**スクリプトの中身**だけ。
 */

import { buildZodJitlessScript } from './zodJitless';

describe('buildZodJitlessScript', () => {
  it('zod が読むキーに jitless を立てる', () => {
    const script = buildZodJitlessScript();

    // zod 側のキー名（node_modules/zod/src/v4/core/core.ts）。
    // ここがずれると黙って効かなくなる
    expect(script).toContain('__zod_globalConfig');
    expect(script).toContain('jitless=true');
  });

  /**
   * 実際に評価して、グローバルへ設定が載ることを見る。
   * 文字列の部分一致だけだと、構文が壊れていても通ってしまう
   */
  it('評価するとグローバルに設定が載る', () => {
    const scope = {} as Record<string, { jitless?: boolean }>;
    new Function('globalThis', buildZodJitlessScript())(scope);

    expect(scope.__zod_globalConfig).toEqual({ jitless: true });
  });

  /**
   * 既に設定がある状態で上書きしないこと。
   * zod は他の設定（localeError など）も同じオブジェクトに持つ
   */
  it('既存の設定を壊さない', () => {
    const scope = {
      __zod_globalConfig: { customError: 'keep' },
    } as unknown as Record<string, Record<string, unknown>>;
    new Function('globalThis', buildZodJitlessScript())(scope);

    expect(scope.__zod_globalConfig).toEqual({
      customError: 'keep',
      jitless: true,
    });
  });

  /**
   * ⚠️ **例外を外へ出さないこと。** `<head>` に置くので、ここで落ちると
   * テーマ初期化も Consent Mode も走らない。
   *
   * ⚠️ `Object.freeze({})` では検証にならない（レビュー指摘）。インライン
   * スクリプトは sloppy mode なので、凍結オブジェクトへの代入は**黙って
   * 失敗する**だけで throw しない。try/catch を外しても通ってしまう。
   * **読むだけで throw する**形を渡すこと
   */
  it('設定の読み取りで例外が出ても外へ出さない', () => {
    const hostile = new Proxy({} as Record<string, unknown>, {
      get() {
        throw new Error('読めない');
      },
      set() {
        throw new Error('書けない');
      },
    });

    expect(() =>
      new Function('globalThis', buildZodJitlessScript())(hostile),
    ).not.toThrow();
  });
});
