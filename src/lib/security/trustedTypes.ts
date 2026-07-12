/**
 * Trusted Types ポリシー（段階3）
 *
 * `unsafe-inline` 許容の弱点である DOM-based XSS を型レベルで封じるため、
 * Trusted Types のポリシーを定義する。DOM sink（`innerHTML` /
 * `dangerouslySetInnerHTML` など）へは、これらのポリシーが生成した
 * `TrustedHTML` / `TrustedScript` のみを渡すようにする。
 *
 * 段階3 は `Content-Security-Policy-Report-Only` での導入のため、ポリシー未使用の
 * 生文字列 sink があっても「ブロックされず」`/api/csp-report` に収集されるだけ。
 * 段階4（enforce）を見据え、既知の sink はここで生成したポリシー経由へ移行する。
 *
 * ブラウザ未対応（`window.trustedTypes` が無い）環境や SSR ではポリシーを
 * 生成できないため、feature-test でグレースフルにフォールバックする
 * （その場合はサニタイズ結果の文字列をそのまま返す）。
 */

import DOMPurify from 'dompurify';

import { TRUSTED_TYPES_POLICIES } from './cspDirectives.mjs';

/**
 * `createPolicy` の戻り値型。`@types/trusted-types` は渡した options のキーだけを
 * 持つ `Pick<...>` を返すため、`createHTML` のみ / `createScript` のみのポリシーを
 * それぞれ表現する（グローバルの `TrustedTypePolicy` は全メソッド必須で不一致になる）。
 */
type HtmlPolicy = Pick<TrustedTypePolicy, 'name' | 'createHTML'>;
type ScriptPolicy = Pick<TrustedTypePolicy, 'name' | 'createScript'>;

/**
 * `trusted-types` 許可リストと一致させるポリシー名。
 *
 * CSP 側の許可リスト（`cspDirectives.mjs` の {@link TRUSTED_TYPES_POLICIES}）を
 * 単一ソースとし、そこから取り出すことで手動同期の乖離を防ぐ。許可リストに
 * 名前が無い状態で `createPolicy` すると enforce 昇格時にポリシー生成が失敗する
 * ため、存在しなければ即座に失敗させる。
 *
 * @param name 許可リストに含まれているべきポリシー名
 * @returns 許可リストで検証済みのポリシー名
 */
function requireAllowedPolicyName(name: string): string {
  if (!TRUSTED_TYPES_POLICIES.includes(name)) {
    throw new Error(
      `Trusted Types policy "${name}" is not in TRUSTED_TYPES_POLICIES (cspDirectives.mjs). ` +
        'CSP の trusted-types 許可リストへ追加すること。',
    );
  }
  return name;
}

export const SANITIZE_HTML_POLICY_NAME =
  requireAllowedPolicyName('sanitize-html');
export const THEME_INIT_POLICY_NAME = requireAllowedPolicyName('theme-init');

/**
 * ブラウザが Trusted Types に対応しているか（＝`createPolicy` が使えるか）を
 * feature-test する。SSR（`window` 無し）や非対応ブラウザでは false。
 */
export function isTrustedTypesSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.trustedTypes !== 'undefined' &&
    typeof window.trustedTypes.createPolicy === 'function'
  );
}

/**
 * 生成済みの sanitize-html ポリシー（多重生成を避けるためモジュール内でキャッシュ）。
 * 同名ポリシーの再生成は enforce 時に例外となるため、必ず使い回す。
 */
let cachedSanitizePolicy: HtmlPolicy | null = null;

/**
 * DOMPurify を裏に持つ `sanitize-html` Trusted Types ポリシーを取得する。
 *
 * `createHTML` は「通常の文字列」を返す必要があるため、DOMPurify は
 * `RETURN_TRUSTED_TYPE: false` で呼ぶ（内部で TrustedHTML を作らせない）。
 * また DOMPurify 独自の内部ポリシー（`dompurify`）を無効化することで、
 * 本ポリシーとの二重ラップ・無限再帰を避ける（`TRUSTED_TYPES_POLICY: null`）。
 *
 * 非対応環境では null を返す（呼び出し側は {@link sanitizeHtml} を使う）。
 */
export function getSanitizeHtmlPolicy(): HtmlPolicy | null {
  if (!isTrustedTypesSupported()) {
    return null;
  }
  if (cachedSanitizePolicy) {
    return cachedSanitizePolicy;
  }
  cachedSanitizePolicy = window.trustedTypes!.createPolicy(
    SANITIZE_HTML_POLICY_NAME,
    {
      createHTML: (input: string): string =>
        DOMPurify.sanitize(input, {
          RETURN_TRUSTED_TYPE: false,
          TRUSTED_TYPES_POLICY: null,
        }) as unknown as string,
    },
  );
  return cachedSanitizePolicy;
}

/**
 * 任意の HTML 文字列をサニタイズして sink へ安全に渡せる値を返す。
 *
 * - Trusted Types 対応環境: `sanitize-html` ポリシーで `TrustedHTML` を返す
 *   （enforce 時でも `innerHTML` へ代入できる）。
 * - 非対応環境 / SSR: DOMPurify でサニタイズした文字列を返す（型は string）。
 *
 * 戻り値は `innerHTML` / `dangerouslySetInnerHTML.__html` にそのまま渡せる。
 *
 * @param dirty サニタイズ対象の生 HTML 文字列
 * @returns TrustedHTML（対応時）またはサニタイズ済み文字列（非対応時）
 */
export function sanitizeHtml(dirty: string): TrustedHTML | string {
  const policy = getSanitizeHtmlPolicy();
  if (policy) {
    return policy.createHTML(dirty);
  }
  // 非対応環境でも DOM-based XSS を防ぐため、必ずサニタイズして返す。
  return DOMPurify.sanitize(dirty, {
    RETURN_TRUSTED_TYPE: false,
    TRUSTED_TYPES_POLICY: null,
  }) as unknown as string;
}

/**
 * 生成済みの theme-init ポリシー（同上、モジュール内キャッシュ）。
 */
let cachedThemeInitPolicy: ScriptPolicy | null = null;

/**
 * テーマ初期化の固定インラインスクリプト（`layout.tsx`）を enforce 昇格後も
 * 動作させるための named ポリシー。入力は固定文字列のみを想定しており、
 * `createScript` はそのまま返す（外部入力を混ぜないこと）。
 *
 * 非対応環境では null を返す（この場合フォールバックは呼び出し側で不要＝
 * Report-Only 段階では素の文字列がそのまま実行される）。
 */
export function getThemeInitPolicy(): ScriptPolicy | null {
  if (!isTrustedTypesSupported()) {
    return null;
  }
  if (cachedThemeInitPolicy) {
    return cachedThemeInitPolicy;
  }
  cachedThemeInitPolicy = window.trustedTypes!.createPolicy(
    THEME_INIT_POLICY_NAME,
    {
      // 入力は固定スクリプト文字列のみ。外部入力は渡さない前提で恒等関数とする。
      createScript: (input: string): string => input,
    },
  );
  return cachedThemeInitPolicy;
}
